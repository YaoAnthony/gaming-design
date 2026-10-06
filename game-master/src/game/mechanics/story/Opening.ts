// ===== 标题画面的第一段：骷髅手一挥，房间从天上一条条砸下来 =====
// 房间先是一片黑。骷髅手从画面下面伸上来，张开手掌从左往右一挥（手腕跟着转，划一道弧）；手扫过哪一条，那一条（几格宽的竖条，连背景、砖、物件一起）就从画面上方掉下来，
// 落地弹两下、扬一点灰、「咚」一声，最后一条落地时整个画面一震。
// 做法：主镜头先藏起来，每一条用一个只看那一条的镜头（视口在那一条，滚动和主镜头对齐），把镜头的视口从画面上方移下来——
// 不用复制画面，房间里的东西照常画。全部落地后拆掉这些镜头、换回主镜头，画面和平时一模一样。
// 手在 React 那边画（ui/story/GmHand），这里把手的位置（画面比例坐标）发过去。落完发 EVT.openingBuilt，
// 然后等菜单里选「开始游戏」/「继续游戏」（EVT.openingStart）：叫 onStart（场景决定是就地出场、回到存档的房间，还是从头开一局）。
import Phaser from 'phaser';
import { bridge, EVT, type OpeningStart } from '@/protocol';
import type { PlayContext } from '@/game/core/PlayContext';
import { openBus, tone, type SynthBus } from '@/audio/synth';
import { DEPTH } from '@/game/depth';

/** 分成几条（房间 30 格宽 = 每条 3 格） */
const STRIPS = 10;
/** 手从下面伸上来要多久；挥过整个画面要多久；一条从上面掉到底（含弹两下）要多久；手收回去要多久（毫秒） */
const T = { reach: 380, sweep: 640, drop: 560, retract: 320 };
/** 挥手的弧线：起点、最高点、终点（画面比例坐标）和手腕转的角度（度） */
const ARC = { from: { x: 0.08, y: 0.42, tilt: -32 }, top: { x: 0.5, y: 0.26, tilt: 0 }, to: { x: 0.92, y: 0.42, tilt: 32 } };
/** 手藏在画面下面多远（画面高的比例） */
const BELOW = 1.45;
/** 一条掉下来、碰到地的时刻（Bounce.out 第一次碰底大约在整段的这个比例） */
const FIRST_HIT = 0.36;

export class Opening {
  private cams: Phaser.Cameras.Scene2D.Camera[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private built = false;
  private bus: SynthBus | null = null;

  constructor(private readonly ctx: PlayContext, private readonly onStart: (mode: OpeningStart['mode']) => void) {
    bridge.on(EVT.openingStart, this.start);
  }

  /** 藏起主镜头、开始扫 */
  begin(): void {
    const scene = this.ctx.scene, main = scene.cameras.main, W = main.width, H = main.height;
    const sw = Math.ceil(W / STRIPS);
    main.setVisible(false);
    for (let i = 0; i < STRIPS; i++) {
      const w = Math.min(sw, W - i * sw);
      const cam = scene.cameras.add(i * sw, -H, w, H, false, `opening-${i}`);
      cam.setScroll(main.scrollX + i * sw, main.scrollY).setRoundPixels(true);
      this.cams.push(cam);
    }
    this.bus = openBus(0.5);
    // 手：从下面伸上来，挥一道弧（两段：到最高点、再落到右边）
    const { from, top, to } = ARC, go = 30 + T.reach;
    this.hand(from.x, BELOW, from.tilt, 0);
    this.later(30, () => this.hand(from.x, from.y, from.tilt, T.reach));
    this.later(go, () => this.hand(top.x, top.y, top.tilt, T.sweep / 2, true));
    this.later(go + T.sweep / 2, () => this.hand(to.x, to.y, to.tilt, T.sweep / 2));
    // 手挥过哪一条，那一条就掉下来（手在 from.x 到 to.x 之间走）
    this.cams.forEach((cam, i) => {
      const k = Math.max(0, Math.min(1, ((i + 0.5) / STRIPS - from.x) / (to.x - from.x)));
      this.later(go + T.sweep * k - 40, () => this.drop(cam, i === STRIPS - 1));
    });
  }

  destroy(): void {
    bridge.off(EVT.openingStart, this.start);
    this.timers.forEach(t => t.remove());
    this.removeCams();
    this.bus?.close();
  }

  /** 一条掉下来：碰到地的那一下「咚」、扬灰；最后一条落地整个画面一震，然后收尾 */
  private drop(cam: Phaser.Cameras.Scene2D.Camera, last: boolean): void {
    const scene = this.ctx.scene;
    scene.tweens.add({ targets: cam, y: 0, duration: T.drop, ease: 'Bounce.out' });
    this.later(T.drop * FIRST_HIT, () => {
      this.thud(last);
      this.dust(cam);
      if (last) scene.cameras.main.shake(260, 0.008);
    });
    if (last) this.later(T.drop + 40, () => this.finish());
  }

  /** 落地扬起的一点灰：这一条底下几团往两边散开、淡掉 */
  private dust(cam: Phaser.Cameras.Scene2D.Camera): void {
    const scene = this.ctx.scene, main = scene.cameras.main;
    const y = main.scrollY + main.height - this.ctx.cfg.tile * 0.9;
    for (let k = 0; k < 4; k++) {
      const x = cam.scrollX + cam.width * (k + 0.5) / 4;
      const puff = scene.add.circle(x, y, 5 + Math.random() * 4, 0xc9c4b4, 0.55).setDepth(DEPTH.openingDust);
      scene.tweens.add({ targets: puff, x: x + (Math.random() - 0.5) * 50, y: y - 12 - Math.random() * 18, scale: 2.4, alpha: 0, duration: 520, ease: 'Quad.out', onComplete: () => puff.destroy() });
    }
  }

  /** 「咚」：低频正弦往下滑；最后一下更重 */
  private thud(heavy: boolean): void {
    const b = this.bus;
    if (!b) return;
    const at = b.now();
    tone(b, { at, dur: heavy ? 0.45 : 0.22, type: 'sine', f0: heavy ? 120 : 160, f1: 38, glide: 'exp', gain: heavy ? 0.9 : 0.45 });
    tone(b, { at, dur: 0.06, type: 'square', f0: 90, f1: 50, gain: heavy ? 0.25 : 0.12 });
  }

  private finish(): void {
    if (this.built) return;
    this.built = true;
    this.removeCams();
    this.hand(ARC.to.x, BELOW, ARC.to.tilt, T.retract);   // 手收回下面
    bridge.emit(EVT.openingBuilt);
    this.later(T.retract, () => bridge.emit(EVT.storyHand, { spot: null, pose: 'open', ms: 0 }));
  }

  private removeCams(): void {
    const scene = this.ctx.scene;
    this.cams.forEach(c => { scene.tweens.killTweensOf(c); scene.cameras.remove(c); });
    this.cams = [];
    scene.cameras.main?.setVisible(true);
  }

  private later(ms: number, fn: () => void): void { this.timers.push(this.ctx.scene.time.delayedCall(ms, fn)); }

  private hand(x: number, y: number, tilt: number, ms: number, whoosh = false): void {
    bridge.emit(EVT.storyHand, { spot: { x, y }, pose: 'open', ms, from: 'bottom', tilt, whoosh });
  }

  /** 菜单里选了「开始」：还没落完（不该发生）就直接落完 */
  private readonly start = (s: OpeningStart): void => {
    if (!this.built) { this.timers.forEach(t => t.remove()); this.finish(); }
    this.onStart(s.mode);
  };
}
