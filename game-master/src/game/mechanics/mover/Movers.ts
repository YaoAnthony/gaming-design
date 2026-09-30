// ===== 移动方块：画了移动标记的方块，相连的一片一起沿一根轴来回走 =====
// - 方块一直在地形网格里（爆炸、引线、支撑、迷雾都照常算），每走满一格把整组在网格里平移一格（Terrain.moveCells）。
//   走到一半的时候网格里还是原来那一格，画面和碰撞已经在路上
// - 瓦片层不画这些格子（drawsCell），由这里画、这里做碰撞：一行连着的格子一个物理体，直接改位置（directControl），
//   站在上面的人、箱子、怪物被带着走
// - 停在格子上的时候检查下一步：整组任何一格的下一格被挡（地形、箱子、别的移动方块、没站在上面的人或怪物），就停一下掉头。
//   往上运人时，人头顶撞墙也算挡住
// - 寄托的方块没了（变成空气），这一格就退出（岩石裂成碎岩还算在）
// - 重置（R、死亡、进入下一关）：所有移动方块先回到一开始的位置，再让地形复原
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { canCarry, rowRuns, stepBlocked, type MoverGroupSpec, type MoverKind } from './kinds';

interface Run { x: number; y: number; len: number }

interface Group {
  kind: MoverKind;
  /** 一开始的格子（重置回这里） */
  home: CellRef[];
  /** 这一格的方块还在吗 */
  alive: boolean[];
  /** 这一格现在是什么砖（岩石裂了要换图） */
  ids: string[];
  /** 现在相对一开始挪了几格 */
  shift: CellRef;
  dir: 1 | -1;
  /** 这一步沿轴走了多少像素（带正负号）；0 = 正好停在格子上 */
  pos: number;
  /** 掉头之后停到什么时候 */
  waitUntil: number;
  /** 这一步要进的格子（格子序号）：别的组这一步不能也进这里 */
  reserved: Set<number>;
  view: Phaser.GameObjects.Container;
  images: (Phaser.GameObjects.Image | null)[];
  /** 物理体：一行连着的格子一个，位置按一开始的布局 + shift + pos 算 */
  bodies: { img: Phaser.Physics.Arcade.Image; run: Run }[];
}

/** 站在方块上面算"站着"：脚底离方块顶面的距离（像素） */
const RIDE_TOLERANCE = 4;
/** 判断人 / 怪挡路时，身体往里收这么多像素 */
const INSET = 2;

export class Movers implements Mechanic {
  private groups: Group[];
  /** 由这里画的格子（所有组现在的位置） */
  private drawn = new Set<number>();
  private readonly solid: Phaser.Physics.Arcade.Group;

  constructor(private ctx: PlayContext, specs: MoverGroupSpec[]) {
    this.solid = ctx.scene.physics.add.group({ allowGravity: false, immovable: true });
    this.groups = specs.map(s => ({
      kind: s.kind, home: s.cells, alive: s.cells.map(() => true), ids: s.cells.map(c => ctx.terrain.grid[c.y][c.x]),
      shift: { x: 0, y: 0 }, dir: s.kind.startDir, pos: 0, waitUntil: 0, reserved: new Set(),
      view: ctx.scene.add.container(0, 0).setDepth(0.5), images: [], bodies: [],
    }));
    this.syncDrawn();   // 一开始就知道自己占哪些格：别的机制 start 时（比如压板摆初始状态）就能问到
  }

  // ---------- 生命周期 ----------
  start(): void {
    this.ctx.addTerrainCollider(this.solid);
    this.groups.forEach(g => { this.rebuild(g); this.place(g); });
    this.syncDrawn();
    this.ctx.terrain.refreshCells(this.groups.flatMap(g => g.home));   // 这些格子从瓦片层拿掉，由这里画
  }

  drawsCell(cx: number, cy: number): boolean { return this.drawn.has(cy * this.ctx.terrain.w + cx); }

  /** 移动方块是重物：停在（或滑过）压板那一格时，压板算被压下。按网格里的位置算，走满一格才算进了那一格 */
  weighs(cx: number, cy: number): boolean { return this.drawsCell(cx, cy); }

  update(now: number, dt: number): void { this.groups.forEach(g => this.tick(g, now, dt)); }

  /** 重置前：所有组带着方块回到一开始的位置（之后地形按原图复原，两边对得上） */
  onClear(): void {
    this.groups.forEach(g => {
      const cells = this.current(g), back = { x: -g.shift.x, y: -g.shift.y };
      g.shift = { x: 0, y: 0 }; g.pos = 0; g.dir = g.kind.startDir; g.waitUntil = 0; g.reserved.clear();
      this.syncDrawn();
      if (back.x || back.y) this.ctx.terrain.moveCells(cells, back.x, back.y);
      this.place(g);
    });
  }

  /** 地形复原之后：一开始的格子上还有能动的砖就算在（整张图重置时炸掉的也回来了） */
  onReset(): void {
    const grid = this.ctx.terrain.grid;
    this.groups.forEach(g => {
      g.home.forEach((c, i) => { const id = grid[c.y]?.[c.x]; g.alive[i] = canCarry(id); if (g.alive[i]) g.ids[i] = id; });
      this.rebuild(g);
      this.place(g);
    });
    this.syncDrawn();
    this.ctx.terrain.refreshCells(this.groups.flatMap(g => g.home));
  }

  // ---------- 每帧 ----------
  private tick(g: Group, now: number, dt: number): void {
    this.sync(g);
    if (!g.alive.some(Boolean)) return;
    const T = this.ctx.cfg.tile;
    if (g.pos === 0) {
      if (now < g.waitUntil) return;
      if (this.blocked(g)) { g.dir = g.dir > 0 ? -1 : 1; g.waitUntil = now + this.ctx.cfg.moverPauseMs; return; }
      // 登记这一步要进的新格子（组里自己已经占着的不算）：别的组这一步不能进，走满一格时再确认一次它们还空着
      const [dx, dy] = this.delta(g), w = this.ctx.terrain.w, cells = this.current(g);
      const own = new Set(cells.map(c => c.y * w + c.x));
      g.reserved = new Set(cells.map(c => (c.y + dy) * w + c.x + dx).filter(i => !own.has(i)));
    }
    const prev = g.pos, step = this.ctx.cfg.moverSpeed * dt;
    // 走到一半也要看：有人（怪）跳上来 / 走进路线里，再往前就会被夹进墙里的话，当场掉头退回去
    if (g.reserved.size && this.squeezes(g, step)) { g.dir = g.dir > 0 ? -1 : 1; g.reserved.clear(); this.place(g); return; }
    g.pos += g.dir * step;
    if (g.reserved.size && Math.abs(g.pos) >= T) {
      // 走满一格：路上可能掉下来了东西，再确认一次目标格还空着；不空就原路退回去
      if (this.targetsFree(g)) this.commit(g);
      else { g.pos = g.dir * T; g.dir = g.dir > 0 ? -1 : 1; g.reserved.clear(); }
    } else if (!g.reserved.size && prev !== 0 && Math.sign(g.pos) !== Math.sign(prev)) {
      g.pos = 0;   // 退回去的路上回到了格子上
    }
    this.place(g);
  }

  /** 方块被炸没了（变成空气 / 被换成不能动的砖）就退出；岩石裂成碎岩换张图 */
  private sync(g: Group): void {
    const grid = this.ctx.terrain.grid;
    let changed = false;
    const lost: CellRef[] = [];
    g.home.forEach((h, i) => {
      if (!g.alive[i]) return;
      const x = h.x + g.shift.x, y = h.y + g.shift.y, id = grid[y]?.[x];
      if (id === undefined || id === AIR || !canCarry(id)) { g.alive[i] = false; changed = true; lost.push({ x, y }); return; }
      if (id !== g.ids[i]) { g.ids[i] = id; g.images[i]?.setTexture(...this.pieceTexture(g, i)); }
    });
    if (!changed) return;
    this.rebuild(g);
    this.place(g);
    this.syncDrawn();
    this.ctx.terrain.refreshCells(lost);
  }

  /** 沿轴走一格的 (dx, dy) */
  private delta(g: Group): [number, number] { return g.kind.axis === 'x' ? [g.dir, 0] : [0, g.dir]; }

  /** 现在（网格里）的格子 */
  private current(g: Group): CellRef[] {
    return g.home.flatMap((h, i) => (g.alive[i] ? [{ x: h.x + g.shift.x, y: h.y + g.shift.y }] : []));
  }

  /** 往 dir 走一格会不会撞 */
  private blocked(g: Group): boolean {
    const { ctx } = this, t = ctx.terrain, T = ctx.cfg.tile;
    const [dx, dy] = this.delta(g), cells = this.current(g);
    const others = new Set(this.groups.filter(o => o !== g).flatMap(o => [...o.reserved]));
    const hit = (x: number, y: number) => x < 0 || y < 0 || x >= t.w || y >= t.h || t.isSolid(x, y) || ctx.occupied(x, y) || ctx.blockedByMechanics(x, y) || others.has(y * t.w + x);
    if (stepBlocked(cells, dx, dy, hit)) return true;
    // 人和怪物：站在上面的被带着走；不在上面、挡在路上的算撞到
    const own = new Set(cells.map(c => `${c.x},${c.y}`));
    const targets = cells.map(c => ({ x: c.x + dx, y: c.y + dy })).filter(c => !own.has(`${c.x},${c.y}`));
    for (const b of this.bodiesAround()) {
      if (this.rides(g, b)) {
        // 往上运：被运的人（怪）头顶撞墙就不走，不把它夹进天花板
        if (dy < 0 && this.rectHitsTerrain(b.left + INSET, b.right - INSET, b.top - T + INSET, b.top, own)) return true;
        continue;
      }
      if (targets.some(c => b.right - INSET > c.x * T && b.left + INSET < (c.x + 1) * T && b.bottom - INSET > c.y * T && b.top + INSET < (c.y + 1) * T)) return true;
    }
    return false;
  }

  /** 能被夹住的身体：玩家和怪物 */
  private bodiesAround(): Phaser.Physics.Arcade.Body[] {
    const { ctx } = this;
    return [ctx.player?.body, ...ctx.enemies.list().map(e => e.body)].filter((b): b is Phaser.Physics.Arcade.Body => !!b && b.enable);
  }

  /**
   * 这一帧再往前走 step 像素，会不会把谁夹进墙里：站在上面的人往上运时头顶有墙；
   * 前进的那一面推到了人（怪），而它另一边紧贴着墙
   */
  private squeezes(g: Group, step: number): boolean {
    const T = this.ctx.cfg.tile, [dx, dy] = this.delta(g), cells = this.current(g);
    const own = new Set(cells.map(c => `${c.x},${c.y}`));
    const px = g.kind.axis === 'x' ? g.pos : 0, py = g.kind.axis === 'y' ? g.pos : 0;
    const lead = cells.filter(c => !own.has(`${c.x + dx},${c.y + dy}`));   // 前进方向上的那一面
    for (const b of this.bodiesAround()) {
      if (this.rides(g, b)) {
        if (dy < 0 && this.rectHitsTerrain(b.left + INSET, b.right - INSET, b.top - step - 1, b.top, own)) return true;
        continue;
      }
      const pushed = lead.some(c => {
        const x0 = c.x * T + px + Math.min(0, dx * step), x1 = (c.x + 1) * T + px + Math.max(0, dx * step);
        const y0 = c.y * T + py + Math.min(0, dy * step), y1 = (c.y + 1) * T + py + Math.max(0, dy * step);
        return b.right - INSET > x0 && b.left + INSET < x1 && b.bottom - INSET > y0 && b.top + INSET < y1;
      });
      if (!pushed) continue;
      const wall = dx > 0 ? this.rectHitsTerrain(b.right, b.right + step + 1, b.top + INSET, b.bottom - INSET, own)
        : dx < 0 ? this.rectHitsTerrain(b.left - step - 1, b.left, b.top + INSET, b.bottom - INSET, own)
        : dy > 0 ? this.rectHitsTerrain(b.left + INSET, b.right - INSET, b.bottom, b.bottom + step + 1, own)
        : this.rectHitsTerrain(b.left + INSET, b.right - INSET, b.top - step - 1, b.top, own);
      if (wall) return true;
    }
    return false;
  }

  /** 这具身体站在这一组的某个顶面上 */
  private rides(g: Group, b: Phaser.Physics.Arcade.Body): boolean {
    const T = this.ctx.cfg.tile, px = g.kind.axis === 'x' ? g.pos : 0, py = g.kind.axis === 'y' ? g.pos : 0;
    const cells = this.current(g), own = new Set(cells.map(c => `${c.x},${c.y}`));
    return cells.some(c => {
      if (own.has(`${c.x},${c.y - 1}`)) return false;   // 不是顶面
      const top = c.y * T + py, left = c.x * T + px;
      return Math.abs(b.bottom - top) <= RIDE_TOLERANCE && b.right > left + 1 && b.left < left + T - 1;
    });
  }

  /** 像素矩形盖到的格子里有没有实心砖（这一组自己的不算） */
  private rectHitsTerrain(x0: number, x1: number, y0: number, y1: number, own: Set<string>): boolean {
    const t = this.ctx.terrain, T = this.ctx.cfg.tile;
    for (let cy = Math.floor(y0 / T); cy <= Math.floor((y1 - 1) / T); cy++)
      for (let cx = Math.floor(x0 / T); cx <= Math.floor((x1 - 1) / T); cx++)
        if (!own.has(`${cx},${cy}`) && (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h || t.isSolid(cx, cy))) return true;
    return false;
  }

  private targetsFree(g: Group): boolean {
    const t = this.ctx.terrain;
    return [...g.reserved].every(i => { const x = i % t.w, y = Math.floor(i / t.w); return !t.isSolid(x, y) && !this.ctx.occupied(x, y); });
  }

  /** 走满一格：网格里整组平移一格，画面位置不跳（shift + 1、pos 归零） */
  private commit(g: Group): void {
    const [dx, dy] = this.delta(g), cells = this.current(g);
    g.shift = { x: g.shift.x + dx, y: g.shift.y + dy };
    g.pos = 0;
    g.reserved.clear();
    this.syncDrawn();   // 先认领新位置，moveCells 放下的时候瓦片层就不画了
    this.ctx.terrain.moveCells(cells, dx, dy);
    this.ctx.fx.fogDirty();
  }

  private syncDrawn(): void {
    const w = this.ctx.terrain.w;
    this.drawn = new Set(this.groups.flatMap(g => this.current(g).map(c => c.y * w + c.x)));
  }

  // ---------- 画面和物理体 ----------
  /** 第 i 格的贴图：墙按这一组里还在的邻居拼（整组一起动，跟旁边不动的墙分开算） */
  private pieceTexture(g: Group, i: number): [string, number] {
    const at = new Map(g.home.map((c, k) => [`${c.x},${c.y}`, k]));
    const h = g.home[i];
    return Terrain.pieceTexture(g.ids[i], (dx, dy) => {
      const k = at.get(`${h.x + dx},${h.y + dy}`);
      return k !== undefined && g.alive[k] && !!Tiles.get(g.ids[k])?.wall;
    });
  }

  // ---------- 画面和物理体 ----------
  /** 按还在的格子重建图片和物理体（布局按一开始的位置，挪动靠 place） */
  private rebuild(g: Group): void {
    const { scene } = this.ctx, T = this.ctx.cfg.tile;
    g.images.forEach(i => i?.destroy());
    g.images = g.home.map((c, i) => (g.alive[i] ? scene.add.image(c.x * T + T / 2, c.y * T + T / 2, ...this.pieceTexture(g, i)) : null));
    g.images.forEach(i => { if (i) g.view.add(i); });
    g.bodies.forEach(b => b.img.destroy());
    g.bodies = rowRuns(g.home.filter((_, i) => g.alive[i])).map(run => {
      const img = this.solid.create(0, 0, 'spark') as Phaser.Physics.Arcade.Image;
      img.setVisible(false);
      const body = img.body as Phaser.Physics.Arcade.Body;
      body.setSize(run.len * T, T, true);
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.pushable = false;
      body.setDirectControl(true);   // 直接改位置，物理引擎按位移算速度：站在上面的会被带着走
      body.setFriction(1, 0);        // 带人靠这个：平台横着挪多少，站在上面的就跟着挪多少（物理组建的物体默认是 0，带不动）
      return { img, run };
    });
    // 新建的物理体在 (0,0)：摆到位置后归位一次，不然第一步会被当成一下子挪了好几百像素，把站在上面的人甩出去。
    // body.reset 按贴图左上角算位置、不管 offset，而这里的碰撞框比贴图大得多（偏移几十像素），第一帧还会被当成
    // 挪了一个偏移量，照样把站在上面的钥匙、人、箱子甩飞；所以再按贴图 + offset 同步一次，上一帧的位置也记成这里
    // （directControl 的位移按 autoFrame 算，它也要记）
    this.place(g);
    g.bodies.forEach(({ img }) => {
      const body = img.body as Phaser.Physics.Arcade.Body & { autoFrame: Phaser.Math.Vector2 };   // autoFrame：类型声明里没写
      body.reset(img.x, img.y);
      body.updateFromGameObject();
      body.prev.copy(body.position);
      body.prevFrame.copy(body.position);
      body.autoFrame.copy(body.position);
    });
  }

  /** 画面和物理体摆到 一开始的位置 + shift 格 + pos 像素 */
  private place(g: Group): void {
    const T = this.ctx.cfg.tile;
    const px = g.shift.x * T + (g.kind.axis === 'x' ? g.pos : 0), py = g.shift.y * T + (g.kind.axis === 'y' ? g.pos : 0);
    g.view.setPosition(px, py);
    g.bodies.forEach(({ img, run }) => img.setPosition(run.x * T + (run.len * T) / 2 + px, run.y * T + T / 2 + py));
  }
}
