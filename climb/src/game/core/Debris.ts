// ===== 碎块（核心）：掉落的地块、飘落的纸、被怪物驮着的纸 =====
// Terrain 负责碎块自己的下落；这里处理碎块和玩家 / 怪物之间发生的事。
import Phaser from 'phaser';
import type { Chunk } from '@/game/terrain/Terrain';
import { Tiles } from '@/game/registry/registry';
import { CarriedPaper, TopPlatform } from '@/sprite';
import { playLand } from '@/particle';
import type { PlayContext } from './PlayContext';

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
    // 飘落中的纸：平台跟着碎块走，站在上面就一起飘
    ctx.terrain.chunks.forEach(ch => {
      const p = this.falling.get(ch.id);
      if (!p) return;
      const b = ctx.terrain.chunkBounds(ch);
      p.place(b.x, b.y, b.w, b.h, dt);
      if (player.body.touching.down && p.ridden) player.rideVx = p.vx;
    });
  }

  /** 玩家与下落碎块：快的压死；慢的（刚断裂）把玩家顶开，当作天花板 */
  handlePlayerContact(): void {
    const { ctx } = this, b = ctx.player.body, rect = ctx.player.rect();
    let crushed = false;
    ctx.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
      if (crushed) return;
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
