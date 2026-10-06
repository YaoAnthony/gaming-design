// ===== 标题画面的第一段：骷髅手在玩家眼前飞快地把这个房间搭出来 =====
// 房间先整个被盖住（黑块），手从下往上、一排排从左到右地「放下」一块块，被放下的地方掀开盖子、闪一下。
// 手在 React 那边画（ui/story/StoryHand），这里每一步把手的位置（画面比例坐标）发过去。搭完发 EVT.openingBuilt，
// 然后等菜单里选「开始」（EVT.openingStart）：叫 onStart（放主角出场；fresh = 标题画面里清除了进度，从头开一局）。
import Phaser from 'phaser';
import { bridge, EVT, type OpeningStart, type ScreenSpot } from '@/protocol';
import type { PlayContext } from '@/game/core/PlayContext';
import { DEPTH } from '@/game/depth';

/** 一块盖子几格见方；每一步放下几块；每一步多久（毫秒）；手第一次伸进来要多久 */
const BLOCK = 2, PER_STEP = 4, STEP_MS = 60, REACH_MS = 450;
/** 盖子的颜色（和画布底色一样黑） */
const COVER = 0x05060d;

export class Opening {
  private covers: Phaser.GameObjects.Rectangle[][] = [];
  private timer: Phaser.Time.TimerEvent | null = null;
  private built = false;

  constructor(private readonly ctx: PlayContext, private readonly onStart: (fresh: boolean) => void) {
    bridge.on(EVT.openingStart, this.start);
  }

  /** 盖住当前房间、开始搭 */
  begin(): void {
    const { ctx } = this, T = ctx.cfg.tile, r = ctx.rooms.current;
    const x0 = r.rx * ctx.rooms.pxW, y0 = r.ry * ctx.rooms.pxH;
    const cols = Math.ceil(ctx.rooms.w / BLOCK), rows = Math.ceil(ctx.rooms.h / BLOCK);
    const S = BLOCK * T;
    // 从下往上一排一排，每排从左到右
    for (let j = rows - 1; j >= 0; j--) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      for (let i = 0; i < cols; i++) row.push(ctx.scene.add.rectangle(x0 + i * S + S / 2, y0 + j * S + S / 2, S + 1, S + 1, COVER).setDepth(DEPTH.openingCover));
      this.covers.push(row);
    }
    const order = this.covers.flat();
    let k = 0;
    this.hand(this.spotOf(order.slice(0, PER_STEP)), 'pinch', REACH_MS);
    const step = () => {
      const batch = order.slice(k, k + PER_STEP);
      k += PER_STEP;
      if (!batch.length) { this.finish(); return; }
      batch.forEach(c => this.reveal(c));
      const next = order.slice(k, k + PER_STEP);
      if (next.length) this.hand(this.spotOf(next), 'pinch', STEP_MS);
    };
    // 手先伸进来，到了再开始一块块放
    this.timer = ctx.scene.time.delayedCall(REACH_MS, () => {
      step();
      this.timer = ctx.scene.time.addEvent({ delay: STEP_MS, loop: true, callback: step });
    });
  }

  destroy(): void {
    bridge.off(EVT.openingStart, this.start);
    this.timer?.remove();
  }

  /** 放下一块：盖子缩没，闪一下白 */
  private reveal(c: Phaser.GameObjects.Rectangle): void {
    const scene = this.ctx.scene;
    const flash = scene.add.rectangle(c.x, c.y, c.width - 2, c.height - 2, 0xffffff, 0.35).setDepth(DEPTH.openingCover + 1);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
    scene.tweens.add({ targets: c, scale: 0.2, alpha: 0, duration: 140, ease: 'Quad.in', onComplete: () => c.destroy() });
  }

  private finish(): void {
    this.timer?.remove(); this.timer = null;
    if (this.built) return;
    this.built = true;
    this.hand(null, 'open', 300);
    this.ctx.scene.cameras.main.shake(120, 0.004);
    bridge.emit(EVT.openingBuilt);
  }

  /** 这几块的中心在画面上的哪 */
  private spotOf(batch: Phaser.GameObjects.Rectangle[]): ScreenSpot {
    const cam = this.ctx.scene.cameras.main;
    const x = batch.reduce((s, c) => s + c.x, 0) / batch.length, y = batch.reduce((s, c) => s + c.y, 0) / batch.length;
    return { x: (x - cam.scrollX) / cam.width, y: (y - cam.scrollY) / cam.height };
  }

  private hand(spot: ScreenSpot | null, pose: 'pinch' | 'open', ms: number): void {
    bridge.emit(EVT.storyHand, { spot, pose, ms });
  }

  /** 菜单里选了「开始」：还没搭完（不该发生）就先搭完 */
  private readonly start = (s: OpeningStart): void => {
    if (!this.built) { this.covers.flat().forEach(c => c.destroy()); this.finish(); }
    this.onStart(s.fresh);
  };
}
