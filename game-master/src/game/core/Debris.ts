// ===== 碎块（核心）：掉落的地块、飘落的纸、被怪物驮着的纸 =====
// Terrain 负责碎块自己的下落；这里处理碎块和玩家 / 怪物之间发生的事。
import Phaser from 'phaser';
import type { Chunk } from '@/game/terrain/Terrain';
import { Tiles } from '@/game/registry/registry';
import { CarriedPaper, Enemy, PaperBody, carryLine } from '@/sprite';
import { playLand } from '@/particle';
import type { PlayContext } from './PlayContext';
import { INSET, pushRiderOutOfWalls, rectHitsCells } from './solid';
import { Colors, hex } from '@/game/palette';
import { overlaps } from './overlap';

/** 纸落到头上：包围盒底边离头顶在这个范围内就算落上了（像素） */
const CATCH_ABOVE = 2, CATCH_BELOW = 10;

/** 碎块格子的上沿离人脚底不到这么多像素，就算在脚下（人正落在它上面），不算压到人 */
const FEET_TOLERANCE = 12;
/** 人和脚下碎块的距离在这个像素以内，就算「一起往下掉」，人的下落速度压到碎块的速度 */
const RIDE_GAP = 16;   // 至少一帧碎块能掉的距离（chunkMaxFall / 60 ≈ 12）

export class Debris {
  /** 被驮着的纸（怪物或玩家驮着） */
  private carried: CarriedPaper[] = [];
  /** 纸（能站的碎块）的物理体（每一格实心）：玩家、钥匙和它们碰撞 */
  readonly platforms: Phaser.Physics.Arcade.Group;
  /** 下落中还能站的碎块（纸）对应的物理平台 */
  private falling = new Map<number, PaperBody>();
  /** 玩家驮着时撞掉了的纸（碎块 id）：不再接回玩家头上，只停在头顶上等人走开 */
  private shrugged = new Set<number>();

  constructor(private ctx: PlayContext) {
    this.platforms = ctx.scene.physics.add.group({ allowGravity: false, immovable: true });
    ctx.solids.register(this.platforms, 'platform', { player: this.hitsPlayer, enemy: this.hitsEnemy });   // 玩家、怪物、箱子、钥匙都能站在纸上、撞到纸
  }

  /** 碎块被别的东西吃掉了（比如砸中 Boss）：平台由 onChunkRemoved 一起删 */
  removeChunk(ch: Chunk): void { this.ctx.terrain.removeChunk(ch); }

  /** Terrain 的回调：碎块没落地就被拿掉了（重置、被吞），它的物理平台一起删 */
  onChunkRemoved(ch: Chunk): void {
    this.falling.get(ch.id)?.destroy(); this.falling.delete(ch.id); this.shrugged.delete(ch.id);
  }

  // ---------- Terrain 的回调 ----------
  onChunkFall(ch: Chunk): void {
    this.ctx.fx.flash('msg.terrainBreak', hex(Colors.gold));
    // 材质说了"下落时能站"就给它一块物理平台
    if (Tiles.get(ch.cells[0].id)?.rideable) {
      const b = this.ctx.terrain.chunkBounds(ch);
      const p = new PaperBody(this.ctx.scene, this.platforms, ch.cells, this.ctx.cfg.tile);
      p.place(b.x, b.y);
      this.falling.set(ch.id, p);
    }
  }

  onChunkLand(ch: Chunk): void {
    const { ctx } = this, cells = ch.cells;
    this.falling.get(ch.id)?.destroy(); this.falling.delete(ch.id); this.shrugged.delete(ch.id);   // 落地后由砖块本身负责碰撞
    ctx.fx.fogDirty();
    playLand(ctx.scene);
    // 飘落的东西（纸）不会砸死任何东西，落地时也不算"埋住"
    if (cells.some(c => (Tiles.get(c.id)?.floatSpeed ?? 0) > 0)) return;
    if (!ctx.dead && !ctx.won && ctx.terrain.cellsOverlapRect(cells, ctx.player.body)) ctx.die('death.buriedByRock');
    ctx.enemies.list().forEach(e => { if (ctx.terrain.cellsOverlapRect(cells, e.body)) ctx.enemies.kill(e); });
  }

  /** 飘落的碎块贴到怪物 / 玩家头顶时，改由它驮着 */
  catchChunk(ch: Chunk): boolean {
    const { ctx } = this, T = ctx.cfg.tile;
    const xs = ch.cells.map(c => c.x), ys = ch.cells.map(c => c.y);
    const left = Math.min(...xs) * T + ch.container.x, right = (Math.max(...xs) + 1) * T + ch.container.x;
    const bottom = (Math.max(...ys) + 1) * T + ch.py;
    // line = 纸底要贴的那条线（头顶；比一格矮的怪物按一格高算，见 carryLine）
    const onHead = (b: Phaser.Physics.Arcade.Body, line = b.top) => bottom >= line - CATCH_ABOVE && bottom <= line + CATCH_BELOW && right > b.left && left < b.right;
    for (const e of ctx.enemies.list()) {
      if (!onHead(e.body, carryLine(e, T))) continue;
      // 飘落时的平台直接交给"被驮着"的纸，碰撞体不中断
      const platform = this.falling.get(ch.id);
      this.falling.delete(ch.id);
      const riding = !!platform && ctx.player.body.touching.down && platform.carries(ctx.player.body);
      const before = ctx.terrain.chunkBounds(ch).y;
      const paper = new CarriedPaper(ctx.scene, this.platforms, e, ch, T, platform);
      this.carried.push(paper);
      // 人正站在上面：纸贴到怪物头顶会往上挪几像素，把人一起挪上去放稳
      if (riding) { ctx.player.y += paper.top - before; ctx.player.setVelocityY(0); }
      ctx.fx.flash('msg.paperOnMonster', hex(Colors.paperWarm));
      return true;
    }
    // 落到玩家头上：玩家驮着走。纸留在接住那一刻的格子位置（不往人身上居中，居中可能一下子挪进墙里；
    // 也不带飘落时左右轻晃的那几像素，晃出去的部分可能正搭在旁边的砖上）；驮着时撞掉过的不再接，停在头顶上等人走开（见 update）
    const pb = ctx.player.body;
    if (!ctx.dead && !ctx.won && !this.shrugged.has(ch.id) && onHead(pb)) {
      const platform = this.falling.get(ch.id);
      this.falling.delete(ch.id);
      this.carried.push(new CarriedPaper(ctx.scene, this.platforms, ctx.player, ch, T, platform, Math.min(...xs) * T - ctx.player.x));
      ctx.fx.flash('msg.paperOnHead', hex(Colors.paperWarm));
      return true;
    }
    return false;
  }

  /**
   * 玩家和纸的碰撞器的 process 回调：纸每一格都实心，只有一种情况不挡——
   * 还在往下飘的纸，它最底下那一段（底面外露的）正从头顶盖到人身上。不然人会被夹在纸和地面之间；
   * 这种情况照旧由 handlePlayerContact 把人往下顶。「从头顶盖下来」= 这一段在人上面，而且横着重叠得比竖着多。
   * 中间几段的底面本来就不碰撞（core/solid.ts），贴着侧面跳不会在接缝上撞头，所以这里不用再管侧面
   */
  readonly hitsPlayer: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, part) => {
    const img = part as Phaser.Physics.Arcade.Image, paper = img.getData('paper') as PaperBody | undefined;
    if (paper?.carriedBy === this.ctx.player) return false;   // 自己头上驮的：不和自己撞
    if (!paper?.falling) return true;
    const b = this.ctx.player.body, p = img.body as Phaser.Physics.Arcade.Body;
    if (!p.checkCollision.down || p.center.y >= b.center.y) return true;   // 底面不外露 / 在人下面或旁边偏下：照常挡
    const overlapX = Math.min(p.right, b.right) - Math.max(p.left, b.left);
    const overlapY = Math.min(p.bottom, b.bottom) - Math.max(p.top, b.top);
    return overlapX <= overlapY;
  };

  /**
   * 怪物和纸的碰撞器的 process 回调：驮着纸的怪物不和自己背上的纸撞。纸是直接改位置挪的，物理引擎按位移算出很大的速度，
   * 和底下的怪物一分离，怪物会被一下子弹出去几十像素（纸跟过去又弹，一路瞬移）
   */
  readonly hitsEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (enemy, part) =>
    ((part as Phaser.Physics.Arcade.Image).getData('paper') as PaperBody | undefined)?.carriedBy !== enemy;

  // ---------- 每帧 ----------
  update(): void {
    const { ctx } = this, T = ctx.cfg.tile;
    // 站在纸上的人、钥匙由纸的物理平台带着走（同移动方块：直接改平台位置，物理引擎按位移带人）
    for (let i = this.carried.length - 1; i >= 0; i--) {
      const c = this.carried[i];
      if (!c.carrier.active) { c.drop(ctx.terrain, T); this.carried.splice(i, 1); continue; }
      if (c.carrier === ctx.player) {
        // 玩家驮着：人一死放下；纸要撞进砖里（顶到天花板、蹭到墙）就被撞掉，从上一帧的位置接着飘，不再接回头上
        if (ctx.dead || c.hits(ctx.blocked)) { this.shrugged.add(c.drop(ctx.terrain, T).id); this.carried.splice(i, 1); continue; }
      } else this.unsqueeze(c);
      c.update();
      this.scrapeRiders(c);
    }
    this.restOnHead();
    this.matchFallSpeed();
    // 飘落中的纸：平台跟着碎块走，站在上面就一起飘
    ctx.terrain.chunks.forEach(ch => {
      const p = this.falling.get(ch.id);
      if (!p) return;
      const b = ctx.terrain.chunkBounds(ch);
      p.place(b.x, b.y);
    });
  }

  /**
   * 接不到头上的纸（驮着时撞掉过的）飘到人头顶时停在头上，人走开了再接着飘：
   * 不然它会穿过人落到地上，把人封在纸砖里。人正往上跳的时候不管，不然会把纸顶着往上抬
   */
  private restOnHead(): void {
    const { ctx } = this, b = ctx.player.body, T = ctx.cfg.tile;
    if (ctx.dead || b.velocity.y < 0) return;
    ctx.terrain.chunks.forEach(ch => {
      if (!(ch.floatSpeed > 0) || !this.shrugged.has(ch.id)) return;
      const xs = ch.cells.map(c => c.x), maxY = Math.max(...ch.cells.map(c => c.y));
      const left = Math.min(...xs) * T + ch.container.x, right = (Math.max(...xs) + 1) * T + ch.container.x;
      const bottom = (maxY + 1) * T + ch.py;
      if (right <= b.left || left >= b.right || bottom <= b.top || bottom > b.top + CATCH_BELOW) return;
      ch.py -= bottom - b.top;
    });
  }

  /**
   * 纸被怪物驮着走，前面的人背后要是贴着墙（或别的实心东西），纸再往前就会把人挤进墙里：瓦片层只挡自己带速度撞进去的物体，
   * 被别人推进去的它不管，人会整个穿进墙、从地板漏出地图。所以摆纸之前先看这一步会不会这样挤到人：
   * 会就让怪物退回到纸刚好不碰人的地方、掉头（和它撞墙掉头一样，移动方块也是这么做的）。站在纸上的人不算，是被带着走的
   */
  private unsqueeze(c: CarriedPaper): void {
    const { ctx } = this, e = c.carrier, T = ctx.cfg.tile;
    if (!(e instanceof Enemy)) return;
    const dx = e.body.x - e.body.prev.x;
    if (dx === 0 || ctx.dead) return;
    const dir = Math.sign(dx), left = c.left, top = c.top;
    const rects = c.platform.rects().map(r => ({ x0: left + r.x0, x1: left + r.x1, y0: top + r.y0, y1: top + r.y1 }));
    // 横向只要有重叠就会推（一帧才推一像素，不能往里收）；竖向往里收，刚好站在纸上 / 头顶擦着纸底的不算。
    // 只算纸的前沿插进去的（在前进方向上挡着的）：刚掉头时纸还和身后的东西重叠着一两像素，
    // 要是也算进来，会按新方向量出「整个重叠」那么远，把怪物一下推到箱子 / 墙的另一边，下一帧又推回来，来回瞬移
    const ahead = (b: Phaser.Physics.Arcade.Body, r: { x0: number; x1: number }) => dir > 0 ? r.x0 < b.left : r.x1 > b.right;
    const pushes = (b: Phaser.Physics.Arcade.Body) => rects.filter(r => b.right > r.x0 && b.left < r.x1 && b.bottom - INSET > r.y0 && b.top + INSET < r.y1 && ahead(b, r));
    // 背后贴着墙或箱子
    const solid = (cx: number, cy: number) => ctx.blocked(cx, cy) || ctx.occupied(cx, cy);
    const pinned = (b: Phaser.Physics.Arcade.Body) => dir > 0 ? rectHitsCells(b.right, b.right + 2, b.top + INSET, b.bottom - INSET, T, solid)
      : rectHitsCells(b.left - 2, b.left, b.top + INSET, b.bottom - INSET, T, solid);
    let overlap = 0;
    const squeeze = (b: Phaser.Physics.Arcade.Body, hit: typeof rects) => {
      overlap = Math.max(overlap, dir > 0 ? Math.max(...hit.map(r => r.x1)) - b.left : b.right - Math.min(...hit.map(r => r.x0)));
    };
    // 人和别的怪物：被推着、背后又贴着墙的才算挤（站在纸上的是被带着走，不算）
    for (const b of [ctx.player.body, ...ctx.enemies.list().filter(o => o !== e).map(o => o.body)]) {
      if (!b.enable || c.platform.carries(b)) continue;
      const hit = pushes(b);
      if (hit.length && pinned(b)) squeeze(b, hit);
    }
    // 箱子太重，纸推不动：碰到就掉头
    for (const b of ctx.solids.bodies('crate')) {
      if (!b.enable) continue;
      const hit = pushes(b);
      if (hit.length) squeeze(b, hit);
    }
    // 墙：纸的前沿插进了实心砖（怪物比一格矮、按一格高托着纸，纸能从箱子上面过去，再往前就是墙）→ 退回墙外、掉头
    for (const r of rects) {
      const cx = Math.floor((dir > 0 ? r.x1 - 1 : r.x0) / T);
      if (!rectHitsCells(cx * T + 1, cx * T + T - 1, r.y0 + INSET, r.y1 - INSET, T, ctx.blocked)) continue;
      overlap = Math.max(overlap, dir > 0 ? r.x1 - cx * T : (cx + 1) * T - r.x0);
    }
    if (!overlap) return;
    e.x -= dir * overlap;
    e.dir = dir > 0 ? -1 : 1;
    e.setVelocityX(e.dir * ctx.cfg.enemySpeed);
  }

  /** 站在被驮着的纸上、被带进墙里的人 / 怪 / 箱子推回墙外：纸从脚下走开，它们就留在墙前面（同移动方块） */
  private scrapeRiders(c: CarriedPaper): void {
    const { ctx } = this, t = ctx.terrain, T = ctx.cfg.tile;
    const solid = (cx: number, cy: number) => t.isSolid(cx, cy) && !t.def(cx, cy).oneWay;
    for (const b of [ctx.player.body, ...ctx.enemies.list().map(e => e.body), ...ctx.solids.bodies('crate')]) {
      if (!b.enable || !c.platform.carries(b)) continue;
      pushRiderOutOfWalls(b, T, solid);
    }
  }

  /** 人站在别人驮着的纸上、或者正在飘落的纸上（被纸带着走，脚下不是地形） */
  ridingPaper(): boolean {
    const b = this.ctx.player.body;
    return this.carried.some(c => c.carrier !== this.ctx.player && c.platform.carries(b))
      || [...this.falling.values()].some(p => p.carries(b));
  }

  /** 这一格的中心被哪块纸（驮着的、飘着的）盖住了：怪物在纸上巡逻时当地面 */
  occupies(cx: number, cy: number): boolean {
    const T = this.ctx.cfg.tile, px = cx * T + T / 2, py = cy * T + T / 2;
    return (this.platforms.getChildren() as Phaser.Physics.Arcade.Image[]).some(img => {
      const b = img.body as Phaser.Physics.Arcade.Body | null;
      return !!b?.enable && px > b.left && px < b.right && py > b.top && py < b.bottom;
    });
  }

  /**
   * 人和脚下的碎块一起往下掉时，人的下落速度不能超过碎块（慢于或等于）：
   * 人的最大下落速度（maxFall）比碎块（chunkMaxFall）快，不限制就会追上、穿进碎块里。
   * 碎块在人正下方、上沿离脚底不到 RIDE_GAP 像素（或人已经陷进去一点）时，速度压到碎块的速度，脚贴回碎块上沿。
   */
  private matchFallSpeed(): void {
    const { ctx } = this, p = ctx.player, b = p.body;
    if (b.velocity.y <= 0) return;
    let top = Infinity, vy = Infinity;
    ctx.terrain.forEachChunkCell((ch, cx, cy, w) => {
      if (cx + w <= b.left || cx >= b.right) return;                                   // 不在正下方
      if (cy < b.bottom - FEET_TOLERANCE || cy > b.bottom + RIDE_GAP) return;           // 没贴着脚
      if (cy < top) { top = cy; vy = ch.vy; }
    });
    if (top === Infinity || b.velocity.y <= vy) return;
    p.setVelocityY(vy);
    if (b.bottom > top) p.y -= b.bottom - top;   // 已经陷进去一点：贴回上沿
  }

  /**
   * 玩家与下落的石块：快的压死；慢的（刚断裂）把玩家顶开，当作天花板。
   * 只算在人头顶 / 身体高度上的格子：人从上面落到还在掉的碎块上（人最快 maxFall，碎块最快 chunkMaxFall，会追上）
   * 是站在它上面，由物理平台接住，不是被压。
   * 纸不在这里管：它有实心的物理体（侧面、顶面都由物理引擎挡），落到头上是被驮着或停在头上（catchChunk / restOnHead）。
   * 以前纸也走这里，格子的位置没算飘落时的左右轻晃，人站在纸的竖条旁边时被当成「格子压在头上」，一下子顶进纸里漏下去
   */
  handlePlayerContact(): void {
    const { ctx } = this, b = ctx.player.body, rect = ctx.player.rect();
    let crushed = false;
    ctx.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
      if (crushed || ch.floatSpeed > 0) return;
      if (cy >= b.bottom - FEET_TOLERANCE) return;   // 这一格在脚下：人是站在 / 落在它上面
      if (!overlaps(cx, cy, w, h, rect)) return;
      if (ch.vy >= ctx.cfg.crushMinSpeed) { crushed = true; return; }
      const overlapY = cy + h - b.y;
      if (overlapY > 0 && overlapY < h) { ctx.player.y += overlapY; if (b.velocity.y < 0) ctx.player.setVelocityY(0); }
    });
    if (crushed) ctx.die('death.crushedByRock');
  }

  /** 整张图重置前：飘纸、掉落平台全清 */
  clear(): void {
    this.carried.forEach(c => c.destroy()); this.carried = [];
    this.falling.forEach(p => p.destroy()); this.falling.clear();
    this.shrugged.clear();
  }

  /**
   * 一个房间重置前：只清材料来自这个房间的纸（它会在原位恢复）；别的房间的纸照样被怪物驮着。
   * 还在掉的碎块由 Terrain.resetRect 按同样的规则拿掉，平台跟着 onChunkRemoved 删
   */
  clearRoom(x0: number, y0: number, w: number, h: number): void {
    this.carried = this.carried.filter(c => {
      if (!c.cells.some(cell => this.ctx.terrain.originIn(cell.from, x0, y0, w, h))) return true;
      c.destroy();
      return false;
    });
  }
}
