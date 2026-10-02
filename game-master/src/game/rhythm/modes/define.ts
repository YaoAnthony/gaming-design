// ===== 2D 节奏玩法的注册表：每种玩法一个文件，在 modes/index.ts 里注册 =====
// 这里是画在游戏画面里的玩法（rhythm/modes.ts 里 realm = flat 的那些）。3D 的在 world3d/rhythm/modes/。
// 一张谱的每个 2D 段落各有一个玩法实例，只管自己那一段的音符：draw 一直调（音符提前出发，上一段还没完就要开始画），update 只在轮到它时调。
import Phaser from 'phaser';
import type { RhythmConfig } from '@/type';
import { NoteTrack, noteProgress, type Judgement, type ModeId, type Note, type Scoreboard } from '@/rhythm';
import { Colors } from '@/game/palette';
import type { Rect } from '../PianoBoss';

/** 这一帧刚按下的键（按着不放只算一次）：四个方向（A W S D / 方向键 / 手柄 / 触屏）和空格 */
export interface Press { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean }

export interface FlatContext {
  scene: Phaser.Scene;
  /** 现在这个房间在游戏世界里占的矩形（像素）、钢琴琴键那一条 */
  room: Rect;
  piano: Rect;
  /** 一格多少像素；画在哪一层（往上加一点点排前后） */
  tile: number;
  depth: number;
  /** 主角的替身：玩法把它摆到自己的轨道上。真的主角藏在原地不动（挪他会揭开迷雾、换房间） */
  hero: Phaser.GameObjects.Image;
  score: Scoreboard;
  /** 音符提前多少毫秒出发 */
  travelMs: number;
  config(): RhythmConfig;
  /** 打中了：替身鼓一下 */
  punch(): void;
}

export interface FlatMode {
  /** 轮到 / 轮完：显示、收起自己的轨道 */
  setActive(on: boolean): void;
  /** 轮到它时每帧调：按键判定、摆人 */
  update(nowMs: number, press: Press): void;
  /** 每帧都调：把自己那一段正在路上的音符摆到位 */
  draw(nowMs: number): void;
  destroy(): void;
}

export type FlatFactory = (ctx: FlatContext, notes: Note[]) => FlatMode;

const factories = new Map<ModeId, FlatFactory>();

export function defineFlatMode(id: ModeId, factory: FlatFactory): void { factories.set(id, factory); }

export function createFlatMode(id: ModeId, ctx: FlatContext, notes: Note[]): FlatMode {
  const f = factories.get(id);
  if (!f) throw new Error(`没有注册这种 2D 节奏玩法：${id}`);
  return f(ctx, notes);
}

/**
 * 一段音符在画面上的样子：每个还在路上、还没处理的音符一个物体，出发时建、打掉 / 飞过去时销毁。
 * make 建一个音符的物体，place 按进度（0 = 刚出发，1 = 到拍点）摆它
 */
export class NoteSprites<T extends Phaser.GameObjects.GameObject> {
  private readonly live = new Map<number, T>();
  private first = 0;

  /** @param past 过了拍点还画多久（进度） */
  constructor(private readonly track: NoteTrack, private readonly travelMs: number, private readonly past: number,
    private readonly make: (n: Note) => T, private readonly place: (o: T, n: Note, progress: number) => void) {}

  draw(nowMs: number): void {
    const { notes, done } = this.track;
    while (this.first < notes.length && noteProgress(notes[this.first], nowMs, this.travelMs) > this.past) this.drop(this.first++);
    for (let i = this.first; i < notes.length; i++) {
      const p = noteProgress(notes[i], nowMs, this.travelMs);
      if (p < 0) break;
      if (done.has(i)) { this.drop(i); continue; }
      let o = this.live.get(i);
      if (!o) { o = this.make(notes[i]); this.live.set(i, o); }
      this.place(o, notes[i], p);
    }
  }

  private drop(i: number): void { this.live.get(i)?.destroy(); this.live.delete(i); }

  destroy(): void { this.live.forEach(o => o.destroy()); this.live.clear(); }
}

// ---------- 击中反馈 ----------
// 音游的手感靠的是「按下去立刻有回应」：每次按键打击点都亮一下（没打中也亮，淡一些）；
// 打中了在音符那里炸开一圈、替身鼓一下、出一声（声音和判定字在 RhythmFight 里统一出）；漏了打击点红一下。

/** 每种判定的颜色 */
export const JUDGE_COLOR: Record<Judgement, number> = { perfect: Colors.gold, good: Colors.sky, miss: Colors.rose };
/** 炸开的一圈：放大到几倍、多久（毫秒）；打击点亮一下：多亮、多久（毫秒）；没打中的空按亮几成 */
const FEEL = { burstScale: 2.4, burstMs: 240, pulseAlpha: 0.75, pulseMs: 170, emptyPress: 0.4 };

/** 在这一点炸开一圈：从音符那么大放大、淡出 */
export function burst(scene: Phaser.Scene, x: number, y: number, size: number, color: number, depth: number): void {
  const ring = scene.add.circle(x, y, size / 2, color, 0.4).setStrokeStyle(4, color).setDepth(depth);
  scene.tweens.add({ targets: ring, scale: FEEL.burstScale, alpha: 0, duration: FEEL.burstMs, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** 打击点：一块平时看不见的亮片，按键时亮一下再暗下去 */
export class Receptor {
  constructor(private readonly scene: Phaser.Scene, private readonly shape: Phaser.GameObjects.Shape) { shape.setAlpha(0); }

  /** hit = 打中的判定；null = 空按（淡淡地亮一下，让人知道键按到了） */
  pulse(hit: Judgement | null): void {
    this.scene.tweens.killTweensOf(this.shape);
    this.shape.setFillStyle(hit ? JUDGE_COLOR[hit] : Colors.paper).setAlpha(FEEL.pulseAlpha * (hit ? 1 : FEEL.emptyPress));
    this.scene.tweens.add({ targets: this.shape, alpha: 0, duration: FEEL.pulseMs });
  }

  setVisible(on: boolean): void { this.shape.setVisible(on); }
  destroy(): void { this.scene.tweens.killTweensOf(this.shape); this.shape.destroy(); }
}
