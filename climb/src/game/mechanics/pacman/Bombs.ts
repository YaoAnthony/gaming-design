// ===== 炸弹（清空豆子之后解锁）：同时一颗，人走开之后挡路，1.5 秒后炸十字 =====
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import type { PlayContext } from '@/game/core/PlayContext';
import type { GhostManager } from './Ghosts';

const FUSE_MS = 1500;
/** 十字每个方向炸几格 */
const REACH = 2;
const GHOST_SCORE = 500;

export class Bombs {
  unlocked = false;
  private bomb: { cell: CellRef; sprite: Phaser.GameObjects.Image; explodeAt: number; armed: boolean } | null = null;

  constructor(private ctx: PlayContext, private ghosts: () => GhostManager | null, private addScore: (n: number) => void) {}

  /** 挡鬼：放下就挡 */
  at(cx: number, cy: number): boolean { return !!this.bomb && this.bomb.cell.x === cx && this.bomb.cell.y === cy; }
  /** 挡人：人走开之后才挡 */
  blocksPlayer(cx: number, cy: number): boolean { return !!this.bomb?.armed && this.at(cx, cy); }

  place(): void {
    if (this.bomb) return;
    const { ctx } = this, T = ctx.cfg.tile, b = ctx.player.body;
    const cell = { x: Math.floor(b.center.x / T), y: Math.floor(b.center.y / T) };
    const sprite = ctx.scene.add.image(cell.x * T + T / 2, cell.y * T + T / 2, 'bomb').setDepth(5);
    ctx.scene.tweens.add({ targets: sprite, scale: 1.15, duration: 250, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.bomb = { cell, sprite, explodeAt: ctx.scene.time.now + FUSE_MS, armed: false };
  }

  update(now: number): void {
    const bm = this.bomb; if (!bm) return;
    const { ctx } = this, T = ctx.cfg.tile, b = ctx.player.body, terrain = ctx.terrain;
    const pc = { x: Math.floor(b.center.x / T), y: Math.floor(b.center.y / T) };
    if (!bm.armed && (pc.x !== bm.cell.x || pc.y !== bm.cell.y)) bm.armed = true;   // 人走开之后炸弹才挡路
    if (now < bm.explodeAt) return;
    this.bomb = null; bm.sprite.destroy();
    // 十字：中心 + 四个方向各 REACH 格；岩石挡住，可炸的砖炸掉并挡住后面
    const cells: CellRef[] = [bm.cell];
    const destroy: CellRef[] = [];
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let i = 1; i <= REACH; i++) {
        const c = { x: bm.cell.x + d[0] * i, y: bm.cell.y + d[1] * i };
        if (c.x < 0 || c.y < 0 || c.x >= terrain.w || c.y >= terrain.h) break;
        const def = terrain.def(c.x, c.y);
        if (def.solid) { if (def.destructible) { cells.push(c); destroy.push(c); } break; }
        cells.push(c);
      }
    }
    cells.forEach(c => {
      const fx = ctx.scene.add.rectangle(c.x * T + T / 2, c.y * T + T / 2, T - 4, T - 4, 0xff9f1c).setDepth(7).setAlpha(0.95);
      ctx.scene.tweens.add({ targets: fx, alpha: 0, scale: 0.6, duration: 380, ease: 'Quad.out', onComplete: () => fx.destroy() });
      ctx.sparks.explode(6, c.x * T + T / 2, c.y * T + T / 2);
    });
    if (destroy.length) { terrain.destroyCellsForce(destroy); ctx.stats.destroyed += destroy.length; }
    ctx.scene.sound.play('boom', { volume: 0.7 });
    ctx.scene.cameras.main.shake(200, 0.01);
    ctx.fx.fogDirty();
    const inBlast = (x: number, y: number) => cells.some(c => c.x === Math.floor(x / T) && c.y === Math.floor(y / T));
    const gm = this.ghosts();
    gm?.ghosts.forEach(g => { if (g.alive && inBlast(g.x, g.y)) { gm.kill(g); ctx.fx.popScore(g.x, g.y, GHOST_SCORE); this.addScore(GHOST_SCORE); } });
    if (!ctx.dead && !ctx.won && inBlast(b.center.x, b.center.y)) ctx.die('被自己的炸弹炸到了');
  }

  /** 重置：地上的炸弹拿掉（解锁状态保留） */
  clear(): void { if (this.bomb) { this.bomb.sprite.destroy(); this.bomb = null; } }
}
