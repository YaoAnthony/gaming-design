// ===== 可推的箱子：1x1、2x2 =====
// - 有重力，推出边缘会掉下去；停下来以后自己对齐格子；爆炸炸不动；可以站在上面
// - 人撞不动它（pushable = false），只有「贴着它、往它那边走、站在地上、身高 ≥ 箱子高」才推得动，推的时候人和箱子都是 pushSpeed
// - 前面被砖或别的箱子挡住就推不动（不能连推）
// - 死亡 / R：回到原位
// - 掉得够快（≥ crushMinSpeed）砸到人头上 → 死；砸到怪物 → 怪物死
// - 占着的格子算「地面」：掉下来的碎块落在箱子上，箱子上的砖算被它撑住；箱子挪开，上面的砖就掉下来
// - 压板（1x1、1x2）：一个落在地上的箱子同时盖住压板的每一格才算压下（人踩没用；大箱子也能压 1x1）。
//   压下的那一刻点燃压板格子里 / 紧挨着压板的引线端点。那些端点被锁住：不画引线头、玩家的爆炸点不着，只能靠压板。
//   引线烧到压板这一头（压板自己点的、或者从另一头烧过来的）压板就没用了，跟着消失；死亡 / R 恢复
import Phaser from 'phaser';
import type { CellRef, RoomCoord } from '@/type';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';

interface Block {
  sprite: Phaser.Physics.Arcade.Image;
  /** 边长（格） */
  size: number;
  /** 出生位置（贴图中心）和所在房间：重置时回到这里 */
  home: { x: number; y: number };
  room: RoomCoord;
  /** 要对齐到的格子左边（贴图坐标）：推的时候朝推的方向下一格，落地时最近的一格；null = 在空中，落地再算 */
  target: number | null;
  /** 上一帧占着的格子范围（变了就让地形重新判支撑） */
  cells: string;
  /** 上一帧的下落速度：砸到人的那一帧，物理引擎已经把速度清掉了，要用撞之前的 */
  lastVy: number;
}

interface Plate {
  /** 压板占的格子（地图坐标），从左到右 */
  cells: CellRef[];
  sprite: Phaser.GameObjects.Image;
  /** 没压 / 压下的贴图 */
  up: string;
  down: string;
  pressed: boolean;
  /** 接在这块压板上的引线端点（被锁住的那几个）：引线烧到它们，压板就跟着没了 */
  ends: CellRef[];
  /** 引线烧过去了：压板已经没用，消失（死亡 / R 恢复） */
  gone: boolean;
}

/** 引线端点离压板格子多远（格）以内会被点燃：压板那一格和上下左右四格 */
const PLATE_FUSE_RADIUS = 1;

/** 身高比箱子矮这么多以内也算够高（主角本身 0.94 格，也要能推 1 格的箱子） */
const HEIGHT_TOLERANCE = 0.1;
/** 贴着箱子：人和箱子的边相距不到这么多像素 */
const CONTACT_PX = 2;
/** 碰撞框每边比贴图小这么多像素，免得在一格宽 / 一格高的口子里卡住 */
const INSET = 1;
/** Arcade 固定步长（秒）：对齐格子时按这个算"一帧正好走到"的速度 */
const PHYSICS_STEP = 1 / 60;
/** 离目标格子不到这么多像素就算到了 */
const SNAP_EPS = 0.05;

// 注意：这里所有位置都从物理体（body）读、也只通过速度或 body 改。场景 update 阶段精灵坐标还是上一帧的
// （Arcade 在 postUpdate 才把位移同步回精灵），直接改精灵坐标再 updateFromGameObject 会把这一帧的物理位移
// 丢掉，postUpdate 又把差值再叠一次 → 箱子推不动、绕格线抖、玩家碰不到它却被塞进去。

/**
 * 碰撞器的 process 回调：分离前按"现在的位置 - 这一步开始的位置"重算两具身体的位移。
 * Arcade 用两者位移的大小关系判断谁撞了谁、要不要分离，位移相等就当没碰上。有重力的箱子每一步都先陷进砖 0.33px
 * 再被砖顶回来，可位移记录里还留着那 0.33 —— 和站在它上面的人 / 箱子（同样的重力、同样的 0.33）正好相等，
 * 于是隔一帧才分离一次，上面的东西就 1px 上下抖。重算之后箱子的位移是 0，上面的东西每帧都能稳稳被顶住。
 */
const syncDeltas: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
  for (const o of [a, b]) {
    const body = ((o as { body?: unknown }).body ?? o) as Phaser.Physics.Arcade.Body & { _dx: number; _dy: number };
    if (!body.prev || !body.moves) continue;
    body._dx = body.x - body.prev.x;
    body._dy = body.y - body.prev.y;
  }
  return true;
};

export class PushBlocks implements Mechanic {
  private list: Block[] = [];
  private plates: Plate[] = [];
  private group: Phaser.Physics.Arcade.Group;

  constructor(private ctx: PlayContext) {
    this.group = ctx.scene.physics.add.group();
    ctx.scene.physics.add.collider(this.group, ctx.terrain.layer);
    ctx.scene.physics.add.collider(this.group, this.group, undefined, syncDeltas);
  }

  /** 放一个箱子：1x1 以那一格为中心；2x2 以那一格为左下角 */
  addBlock(size: number, cell: { x: number; y: number; rx: number; ry: number }): void {
    const T = this.ctx.cfg.tile;
    const x = cell.x * T + (size * T) / 2, y = (cell.y + 1) * T - (size * T) / 2;
    const sprite = this.group.create(x, y, size === 1 ? 'crate1' : 'crate2') as Phaser.Physics.Arcade.Image;
    sprite.setDepth(2.6);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(size * T - INSET * 2, size * T - INSET, false).setOffset(INSET, INSET);   // 底边贴着贴图底边
    body.pushable = false;
    body.setMaxVelocityY(this.ctx.cfg.maxFall);
    this.list.push({ sprite, size, home: { x, y }, room: { rx: cell.rx, ry: cell.ry }, target: null, cells: '', lastVy: 0 });
  }

  /** 放一块压板：width = 1 或 2（格），放的那一格是它的左边那格 */
  addPlate(width: number, cell: { x: number; y: number }): void {
    const T = this.ctx.cfg.tile, up = width === 1 ? 'plate1' : 'plate2';
    const sprite = this.ctx.scene.add.image(cell.x * T, (cell.y + 1) * T, up).setOrigin(0, 1).setDepth(2.5);
    const cells = Array.from({ length: width }, (_, i) => ({ x: cell.x + i, y: cell.y }));
    this.plates.push({ cells, sprite, up, down: up + '_down', pressed: false, ends: [], gone: false });
  }

  // ---------- 生命周期 ----------
  start(): void {
    const { scene, player, enemies } = this.ctx;
    // 接在压板上的引线头交给压板：锁住（不画、爆炸点不着）
    this.plates.forEach(pl => {
      pl.ends = pl.cells.flatMap(c => this.ctx.fuses.endsNear(c, PLATE_FUSE_RADIUS, true));
      this.ctx.fuses.lockEnds(pl.ends);
    });
    this.settlePlates();   // 一开始就压着的（箱子出生在压板上）不点引线
    scene.physics.add.collider(player, this.group, undefined, syncDeltas);
    scene.physics.add.collider(enemies.group, this.group, undefined, syncDeltas);
  }

  /** 格子被哪个箱子占着：箱子的碰撞框盖住了这一格的中心 */
  occupies(cx: number, cy: number): boolean {
    const T = this.ctx.cfg.tile, px = cx * T + T / 2, py = cy * T + T / 2;
    return this.list.some(bl => { const b = bl.sprite.body as Phaser.Physics.Arcade.Body; return b.enable && px > b.left && px < b.right && py > b.top && py < b.bottom; });
  }

  /**
   * 每帧：砸人、占的格子变了就重新判支撑；地上的箱子滑向目标格子（推的逻辑在 updateAlive 里，后跑，会覆盖这里的速度）。
   * 目标格子永远在推的方向上，所以松手后箱子只会继续走完这一格，不会往回弹、也不会把人顶走。
   */
  update(): void {
    const T = this.ctx.cfg.tile, speed = this.ctx.cfg.pushSpeed;
    this.crush();
    this.resupportIfMoved();
    this.updatePlates();
    this.list.forEach(bl => {
      const s = bl.sprite, b = s.body as Phaser.Physics.Arcade.Body;
      if (!b.enable) return;
      if (!b.blocked.down && !b.touching.down) { s.setVelocityX(0); bl.target = null; return; }   // 在空中：直直往下掉，落地再对齐
      const left = b.left - INSET;
      if (bl.target === null) bl.target = Math.round(left / T) * T;                                // 刚落地 / 刚出生：最近的格子
      const diff = bl.target - left;
      if (Math.abs(diff) < SNAP_EPS) {
        s.setVelocityX(0);
        if (diff) { b.x += diff; b.updateCenter(); }   // 只改 body：postUpdate 会把这点差值同步给精灵
        return;
      }
      if (this.someoneAhead(b, Math.sign(diff), Math.abs(diff))) { s.setVelocityX(0); return; }   // 前面站着人 / 怪：等他走开，不要顶着他抖
      s.setVelocityX(Phaser.Math.Clamp(diff / PHYSICS_STEP, -speed, speed));                       // 最后一帧正好走到，不会越过格线
    });
  }

  /** 人贴着箱子往那边走 → 推 */
  updateAlive(): void {
    const { ctx } = this, p = ctx.player, pb = p.body, T = ctx.cfg.tile, speed = ctx.cfg.pushSpeed;
    const dir = Math.sign(pb.velocity.x);
    if (!dir || !pb.blocked.down && !pb.touching.down) return;
    for (const bl of this.list) {
      const bb = bl.sprite.body as Phaser.Physics.Arcade.Body;
      if (!bb.enable) continue;
      if (pb.bottom <= bb.top + 2 || pb.top >= bb.bottom - 2) continue;                                   // 上下没对上（比如人站在箱子上）
      const gap = dir > 0 ? bb.left - pb.right : pb.left - bb.right;
      if (gap < -CONTACT_PX * 2 || gap > CONTACT_PX) continue;                                            // 没贴着
      if (!bb.blocked.down && !bb.touching.down) continue;                                                // 箱子在空中
      if (p.heightTiles + HEIGHT_TOLERANCE < bl.size) continue;                                           // 不够高
      if (!this.pathClear(bl, dir)) continue;                                                             // 前面挡住了
      bl.sprite.setVelocityX(dir * speed);
      p.setVelocityX(dir * speed);
      // 目标 = 推的方向上的下一条格线（已经在格线上就是再下一格）；松手后 update 会把这一格走完
      const left = bb.left - INSET;
      bl.target = (dir > 0 ? Math.ceil((left + SNAP_EPS) / T) : Math.floor((left - SNAP_EPS) / T)) * T;
      return;
    }
  }

  /** 死亡：所有箱子回到原位。按 R：出生在这个房间的、或者现在就在这个房间里的箱子回到原位（从别的房间推过来的也回去） */
  onReset(scope: 'room' | 'world' | 'level'): void {
    const { rooms } = this.ctx;
    this.list.forEach(bl => {
      const b = bl.sprite.body as Phaser.Physics.Arcade.Body;
      const here = rooms.same(bl.room, rooms.current) || rooms.same(rooms.of(b.center.x, b.center.y), rooms.current);
      if (scope === 'room' && !here) return;
      bl.sprite.setAngle(0).setScale(1).setAlpha(1);
      b.enable = true;
      b.reset(bl.home.x, bl.home.y);
      bl.target = null; bl.cells = ''; bl.lastVy = 0;
    });
    // 烧掉的压板跟着引线一起恢复：R 只恢复这个房间的（引线也只恢复这个房间），死亡恢复全部
    this.plates.forEach(pl => {
      if (!pl.gone || (scope === 'room' && !pl.cells.some(c => this.ctx.rooms.same(this.ctx.rooms.of(c.x * this.ctx.cfg.tile, c.y * this.ctx.cfg.tile), this.ctx.rooms.current)))) return;
      pl.gone = false;
      pl.sprite.setVisible(true);
    });
    this.settlePlates();   // 箱子回到原位后压板跟着复原，不重新点引线（引线也复原了）
  }

  /** 引线烧到压板接的那一头（或压板本身那一格）：压板没用了，炸掉消失 */
  onFuseBurn(cells: CellRef[]): void {
    const T = this.ctx.cfg.tile, hit = (list: CellRef[]) => list.some(a => cells.some(c => c.x === a.x && c.y === a.y));
    this.plates.forEach(pl => {
      if (pl.gone || !(hit(pl.ends) || hit(pl.cells))) return;
      pl.gone = true; pl.pressed = false;
      pl.sprite.setVisible(false);
      pl.cells.forEach(c => this.ctx.sparks.explode(8, c.x * T + T / 2, (c.y + 1) * T - 6));
    });
  }

  vortexTargets(): Suckable[] {
    this.list.forEach(bl => { (bl.sprite.body as Phaser.Physics.Arcade.Body).enable = false; });
    return this.list.map(bl => bl.sprite);
  }

  // ---------- 内部 ----------
  /** 压板有没有被压下：有一个箱子同时盖住它的每一格（ground = 还要求箱子落在地上，掉下来路过的不算） */
  private pressedBy(pl: Plate, ground: boolean): boolean {
    const T = this.ctx.cfg.tile;
    return this.list.some(bl => {
      const b = bl.sprite.body as Phaser.Physics.Arcade.Body;
      if (!b.enable || (ground && !b.blocked.down && !b.touching.down)) return false;
      return pl.cells.every(c => { const px = c.x * T + T / 2, py = c.y * T + T / 2; return px > b.left && px < b.right && py > b.top && py < b.bottom; });
    });
  }

  private showPlate(pl: Plate): void { pl.sprite.setTexture(pl.pressed ? pl.down : pl.up); }

  /** 不触发，只按箱子现在的位置摆好压板（进场、重置） */
  private settlePlates(): void {
    this.plates.forEach(pl => { if (pl.gone) return; pl.pressed = this.pressedBy(pl, false); this.showPlate(pl); });
  }

  /** 每帧：压板状态变了就换样子；刚被压下 → 点燃旁边的引线 */
  private updatePlates(): void {
    const { ctx } = this, T = ctx.cfg.tile;
    this.plates.forEach(pl => {
      if (pl.gone) return;
      const now = this.pressedBy(pl, true);
      if (now === pl.pressed) return;
      pl.pressed = now;
      this.showPlate(pl);
      if (!now) return;
      const seen = new Set<string>(), ends: CellRef[] = [];
      pl.cells.forEach(c => ctx.fuses.endsNear(c, PLATE_FUSE_RADIUS, true).forEach(e => { const k = `${e.x},${e.y}`; if (!seen.has(k)) { seen.add(k); ends.push(e); } }));
      pl.cells.forEach(c => ctx.sparks.explode(4, c.x * T + T / 2, (c.y + 1) * T - 4));
      if (ends.length && ctx.igniteFuses(ends)) ctx.fx.flash('引线点燃！', '#ff7b54');
    });
  }

  /** 掉得够快的箱子砸到人 / 怪物头上 */
  private crush(): void {
    const { ctx } = this;
    this.list.forEach(bl => {
      const b = bl.sprite.body as Phaser.Physics.Arcade.Body;
      const vy = Math.max(b.velocity.y, bl.lastVy);
      bl.lastVy = b.velocity.y;
      if (!b.enable || vy < ctx.cfg.crushMinSpeed) return;
      const hits = (r: { x: number; y: number; width: number; height: number }) =>
        b.bottom >= r.y - 2 && b.top < r.y && b.right > r.x + 2 && b.left < r.x + r.width - 2;   // 箱子底边压到对方头顶
      if (!ctx.dead && !ctx.won && hits(ctx.player.body)) ctx.die('被箱子砸扁了');
      ctx.enemies.list().forEach(e => { if (hits(e.body)) ctx.enemies.kill(e); });
    });
  }

  /** 箱子占的格子变了（被推走、掉下去）：上面托着的砖可能没支撑了，让地形重新判 */
  private resupportIfMoved(): void {
    const T = this.ctx.cfg.tile;
    let moved = false;
    this.list.forEach(bl => {
      const b = bl.sprite.body as Phaser.Physics.Arcade.Body;
      const key = `${Math.floor((b.left + b.width / 2) / T)},${Math.floor((b.top + b.height / 2) / T)}`;
      if (key !== bl.cells) { if (bl.cells) moved = true; bl.cells = key; }
    });
    if (moved) this.ctx.terrain.resolveSupport();
  }

  /** 箱子滑向目标的这段路（dist 像素）上站着人或怪物吗：站着就先不动，免得顶着对方来回抖 */
  private someoneAhead(b: Phaser.Physics.Arcade.Body, dir: number, dist: number): boolean {
    const { ctx } = this;
    const ahead = new Phaser.Geom.Rectangle(dir > 0 ? b.right : b.left - dist - 1, b.top + 2, dist + 1, b.height - 4);
    const hit = (o: { x: number; y: number; width: number; height: number }) =>
      Phaser.Geom.Intersects.RectangleToRectangle(ahead, new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height));
    if (!ctx.dead && hit(ctx.player.body)) return true;
    return ctx.enemies.list().some(e => hit(e.body));
  }

  /** 箱子前面一列（它的整个高度）没有砖、也没有别的箱子 */
  private pathClear(bl: Block, dir: number): boolean {
    const { ctx } = this, T = ctx.cfg.tile, t = ctx.terrain, bb = bl.sprite.body as Phaser.Physics.Arcade.Body;
    const ax = dir > 0 ? bb.right + 1 : bb.left - 2;
    const cx = Math.floor(ax / T);
    for (let cy = Math.floor(bb.top / T); cy <= Math.floor((bb.bottom - 1) / T); cy++)
      if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h || t.isSolid(cx, cy)) return false;
    const ahead = new Phaser.Geom.Rectangle(dir > 0 ? bb.right : bb.left - 3, bb.top + 2, 3, bb.height - 4);
    return !this.list.some(o => {
      if (o === bl) return false;
      const ob = o.sprite.body as Phaser.Physics.Arcade.Body;
      return Phaser.Geom.Intersects.RectangleToRectangle(ahead, new Phaser.Geom.Rectangle(ob.x, ob.y, ob.width, ob.height));
    });
  }
}
