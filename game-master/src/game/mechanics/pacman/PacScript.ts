// ===== 清豆之后的剧本：追 → 画外音 → 解锁炸弹 → 鬼全灭 → 骷髅王登场 =====
// 用时间戳推进，不用定时器（重置会清定时器）；死亡重置不打断。
import type { PlayContext } from '@/game/core/PlayContext';
import type { GhostManager } from './Ghosts';
import type { Bombs } from './Bombs';
import type { Dir4 } from './GridWalker';
import { PAC_DIALOGUES } from './dialogues';

export type PacPhase = 'play' | 'chase' | 'taunt' | 'bombs' | 'kingWait' | 'king' | 'done';

const KING = '骷髅王';
/** 清空后多久开始画外音 */
const TAUNT_AFTER_MS = 6000;
/** 画外音结束后多久解锁炸弹 */
const BOMBS_AFTER_MS = 1000;
/** 鬼全灭后多久骷髅王说话 */
const KING_AFTER_MS = 2000;
const CHASE_SPEED_MUL = 1.5;

export class PacScript {
  private phase: PacPhase = 'play';
  private at = 0;

  constructor(private ctx: PlayContext, private ghosts: () => GhostManager | null, private bombs: Bombs, private heading: () => Dir4) {}

  /** 剧情开始前（豆子还没吃光） */
  get playing(): boolean { return this.phase === 'play'; }

  /** 豆子吃光：不结束。鬼提速永久追击，剧本开始 */
  onCleared(now: number): void {
    if (this.phase !== 'play') return;
    this.phase = 'chase'; this.at = now;
    const gm = this.ghosts();
    if (gm) { gm.speedMul = CHASE_SPEED_MUL; gm.forceChase(); }
    this.ctx.scene.cameras.main.shake(200, 0.006);
  }

  update(now: number): void {
    const { ctx } = this;
    switch (this.phase) {
      case 'chase':
        if (now - this.at >= TAUNT_AFTER_MS) { this.phase = 'taunt'; ctx.dialogue.cutscene(KING, PAC_DIALOGUES.taunt, now, () => { this.phase = 'bombs'; this.at = ctx.scene.time.now; }); }
        break;
      case 'bombs': {
        if (!this.bombs.unlocked && now - this.at >= BOMBS_AFTER_MS) { this.bombs.unlocked = true; ctx.fx.flash('空格', '#ffd166'); }
        const gm = this.ghosts();
        if (this.bombs.unlocked && (!gm || !gm.anyAlive)) { this.phase = 'kingWait'; this.at = now; }
        break;
      }
      case 'kingWait':
        if (now - this.at >= KING_AFTER_MS) { this.phase = 'king'; ctx.dialogue.cutscene(KING, PAC_DIALOGUES.king, now, () => this.spawnKing()); }
        break;
    }
  }

  /** 骷髅王出现在你面前两格：淡入。后面的剧情再接 */
  private spawnKing(): void {
    const { ctx } = this;
    this.phase = 'done'; this.at = ctx.scene.time.now;
    const T = ctx.cfg.tile, b = ctx.player.body, h = this.heading();
    const dx = h.x || (h.y ? 0 : 1), dy = h.x ? 0 : h.y;
    let cx = Math.floor(b.center.x / T), cy = Math.floor(b.center.y / T);
    for (let i = 0; i < 2; i++) { const nx = cx + dx, ny = cy + dy; if (ctx.terrain.isSolid(nx, ny)) break; cx = nx; cy = ny; }
    const king = ctx.scene.add.image(cx * T + T / 2, cy * T + T / 2 + 4, 'skeleton').setScale(1.25).setAlpha(0).setDepth(6.5).setFlipX(dx > 0);
    ctx.scene.tweens.add({ targets: king, alpha: 1, duration: 1200, ease: 'Sine.out' });
    ctx.scene.cameras.main.flash(300, 255, 255, 255, false);
  }
}
