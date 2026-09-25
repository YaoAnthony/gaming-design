// ===== 碎块（核心）：掉落的地块、飘落的纸、被怪物驮着的纸 =====
// Terrain 负责碎块自己的下落；这里处理碎块和玩家 / 怪物之间发生的事。
import Phaser from 'phaser';
import type { Chunk } from '@/game/terrain/Terrain';
import { Tiles } from '@/game/registry/registry';
import { CarriedPaper, TopPlatform } from '@/sprite';
import { playLand } from '@/particle';
import type { PlayContext } from './PlayContext';

/** 碎块格子的上沿离人脚底不到这么多像素，就算在脚下（人正落在它上面），不算压到人 */
const FEET_TOLERANCE = 12;
/** 人和脚下碎块的距离在这个像素以内，就算「一起往下掉」，人的下落速度压到碎块的速度 */
const RIDE_GAP = 16;   // 至少一帧碎块能掉的距离（chunkMaxFall / 60 ≈ 12）

export class Debris {
  /** 被怪物驮着的纸 */
  private carried: CarriedPaper[] = [];
  /** 纸（能站的碎块）的物理平台：玩家和它们碰撞 */
  readonly platforms: Phaser.Physics.Arcade.Group;
  /** 下落中还能站的碎块（纸）对应的物理平台 */
  private falling = new Map<number, TopPlatform>();

  constructor(private ctx: PlayContext) {
    this.platforms = ctx.scene.physics.add.group({ allowGravity: false, immovable: true });
  }

  /** 碎块被别的东西吃掉了（比如砸中 Boss）：平台一起删 */
  removeChunk(ch: Chunk): void {
    this.falling.get(ch.id)?.destroy(); this.falling.delete(ch.id);
    this.ctx.terrain.removeChunk(ch);
  }

  // ---------- Terrain 的回调 ----------
  onChunkFall(ch: Chunk): void {
    this.ctx.fx.flash('地形断裂！', '#ffd166');
    // 材质说了"下落时能站"就给它一块物理平台
    if (Tiles.get(ch.cells[0].id)?.rideable) {
      const b = this.ctx.terrain.chunkBounds(ch);
      const p = new TopPlatform(this.ctx.scene, this.platforms, b.w, b.h);
      p.place(b.x, b.y, b.w, b.h, 0);
      this.falling.set(ch.id, p);
    }
  }

  onChunkLand(ch: Chunk): void {
    const { ctx } = this, cells = ch.cells;
    this.falling.get(ch.id)?.destroy(); this.falling.delete(ch.id);   // 落地后由砖块本身负责碰撞
    ctx.fx.fogDirty();
    playLand(ctx.scene);
    // 飘落的东西（纸）不会砸死任何东西，落地时也不算"埋住"
    if (cells.some(c => (Tiles.get(c.id)?.floatSpeed ?? 0) > 0)) return;
    if (!ctx.dead && !ctx.won && ctx.terrain.cellsOverlapRect(cells, ctx.player.body)) ctx.die('被落石埋住了');
    ctx.enemies.list().forEach(e => { if (ctx.terrain.cellsOverlapRect(cells, e.body)) ctx.enemies.kill(e); });
  }

  /** 飘落的碎块贴到怪物头顶时，改由怪物驮着 */
  catchChunk(ch: Chunk): boolean {
    const { ctx } = this, T = ctx.cfg.tile;
    const xs = ch.cells.map(c => c.x), ys = ch.cells.map(c => c.y);
    const left = Math.min(...xs) * T + ch.container.x, right = (Math.max(...xs) + 1) * T + ch.container.x;
    const bottom = (Math.max(...ys) + 1) * T + ch.py;
    for (const e of ctx.enemies.list()) {
      const b = e.body;
      if (bottom < b.top - 2 || bottom > b.top + 10) continue;
      if (right <= b.left || left >= b.right) continue;
      // 飘落时的平台直接交给"被驮着"的纸，碰撞体不中断
      const platform = this.falling.get(ch.id);
      this.falling.delete(ch.id);
      const riding = !!platform && ctx.player.body.touching.down && platform.ridden;
      const paper = new CarriedPaper(ctx.scene, this.platforms, e, ch, T, platform);
      this.carried.push(paper);
      // 人正站在上面：纸贴到怪物头顶会往上挪几像素，把人一起放稳
      if (riding) { ctx.player.y = paper.platform.body.top - ctx.player.body.height / 2 - 1; ctx.player.setVelocityY(0); }
      ctx.fx.flash('纸落在怪物背上了', '#f4f1e8');
      return true;
    }
    return false;
  }

  // ---------- 每帧 ----------
  update(dt: number): void {
    const { ctx } = this, T = ctx.cfg.tile, player = ctx.player;
    player.rideVx = 0;
    for (let i = this.carried.length - 1; i >= 0; i--) {
      const c = this.carried[i];
      if (!c.enemy.active) { c.drop(ctx.terrain, T); this.carried.splice(i, 1); continue; }
      c.update(dt);
      // 站在纸上的人跟着怪物走：给速度而不是直接挪位置，这样撞墙照样会被挡住
      if (player.body.touching.down && c.platform.ridden) player.rideVx = c.enemy.body.velocity.x;
    }
    this.matchFallSpeed();
    // 飘落中的纸：平台跟着碎块走，站在上面就一起飘
    ctx.terrain.chunks.forEach(ch => {
      const p = this.falling.get(ch.id);
      if (!p) return;
      const b = ctx.terrain.chunkBounds(ch);
      p.place(b.x, b.y, b.w, b.h, dt, ch.vy);
      if (player.body.touching.down && p.ridden) player.rideVx = p.vx;
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
   * 玩家与下落碎块：快的压死；慢的（刚断裂）把玩家顶开，当作天花板。
   * 只算在人头顶 / 身体高度上的格子：人从上面落到还在掉的碎块上（人最快 maxFall，碎块最快 chunkMaxFall，会追上）
   * 是站在它上面，由物理平台接住，不是被压。
   */
  handlePlayerContact(): void {
    const { ctx } = this, b = ctx.player.body, rect = ctx.player.rect();
    let crushed = false;
    ctx.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
      if (crushed) return;
      if (cy >= b.bottom - FEET_TOLERANCE) return;   // 这一格在脚下：人是站在 / 落在它上面
      if (!Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), rect)) return;
      if (ch.vy >= ctx.cfg.crushMinSpeed) { crushed = true; return; }
      const overlapY = cy + h - b.y;
      if (overlapY > 0 && overlapY < h) { ctx.player.y += overlapY; if (b.velocity.y < 0) ctx.player.setVelocityY(0); }
    });
    if (crushed) ctx.die('被落石压住了');
  }

  /** 重置前：飘纸、掉落平台全清 */
  clear(): void {
    this.carried.forEach(c => c.destroy()); this.carried = [];
    this.falling.forEach(p => p.destroy()); this.falling.clear();
  }
}
