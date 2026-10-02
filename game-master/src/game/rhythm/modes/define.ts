// ===== 2D 节奏玩法的注册表：每种玩法一个文件，在 modes/index.ts 里注册 =====
// 这里是画在游戏画面里的玩法（rhythm/modes.ts 里 realm = flat 的那些）。3D 的在 world3d/rhythm/modes/。
// 一张谱的每个 2D 段落各有一个玩法实例，只管自己那一段的音符：draw 一直调（音符提前出发，上一段还没完就要开始画），update 只在轮到它时调。
import Phaser from 'phaser';
import type { RhythmConfig } from '@/type';
import { NoteTrack, noteProgress, tailProgress, type Judgement, type ModeId, type Note, type Scoreboard } from '@/rhythm';
import type { MoveInput } from '@/game/mechanics/define';
import { Colors } from '@/game/palette';
import type { Rect } from '../PianoBoss';

/**
 * 这一帧刚按下的键（按着不放只算一次）：四个方向（A W S D / 方向键 / 手柄 / 触屏）、空格、
 * 四条道（从左到右 Q W E R；方向键、手柄、触屏的 ← ↑ ↓ → 也算）；held = 四个方向现在按没按着（长按用）
 */
export interface Press { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean; lanes: boolean[]; held: MoveInput }

export interface FlatContext {
  scene: Phaser.Scene;
  /** 现在这个房间在游戏世界里占的矩形（像素）；地面的 y；主角站在哪（x）；音符从哪出来（钢琴琴键的左端）；骷髅王在哪（道具从他手里扔出来） */
  room: Rect;
  ground: number;
  heroX: number;
  source: { x: number; y: number };
  boss: { x: number; y: number };
  /** 一格多少像素；画在哪一层（往上加一点点排前后） */
  tile: number;
  depth: number;
  /** 主角的替身：玩法把它摆到自己的轨道上。真的主角藏在原地不动（挪他会揭开迷雾、换房间） */
  hero: Phaser.GameObjects.Image;
  score: Scoreboard;
  /** 音符提前多少毫秒出发 */
  travelMs: number;
  /** 曲子的拍子：一拍多少毫秒、第一拍在曲子的第几毫秒 */
  beat: { ms: number; offsetMs: number };
  config(): RhythmConfig;
  /** 打中了：替身鼓一下 */
  punch(): void;
}

export interface FlatMode {
  /** 轮到 / 轮完：摆出、收起自己的道具 */
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
 * make 建一个音符的物体；place 摆它：p = 头的进度（0 = 刚出发，1 = 到拍点），tail = 长按尾巴的进度（不是长按就和头一样），
 * holding = 这个长按正被按着（头已经打中了）
 */
export class NoteSprites<T extends Phaser.GameObjects.GameObject> {
  private readonly live = new Map<number, T>();
  private first = 0;

  /** @param past 过了拍点还画多久（进度） */
  constructor(private readonly track: NoteTrack, private readonly travelMs: number, private readonly past: number,
    private readonly make: (n: Note) => T, private readonly place: (o: T, n: Note, p: number, tail: number, holding: boolean) => void) {}

  draw(nowMs: number): void {
    const { notes, done, holding } = this.track;
    while (this.first < notes.length && tailProgress(notes[this.first], nowMs, this.travelMs) > this.past) this.drop(this.first++);
    for (let i = this.first; i < notes.length; i++) {
      const n = notes[i], p = noteProgress(n, nowMs, this.travelMs);
      if (p < 0) break;
      const held = holding.includes(n);
      if (done.has(i) && !held) { this.drop(i); continue; }
      let o = this.live.get(i);
      if (!o) { o = this.make(n); this.live.set(i, o); }
      this.place(o, n, p, tailProgress(n, nowMs, this.travelMs), held);
    }
  }

  private drop(i: number): void { this.live.get(i)?.destroy(); this.live.delete(i); }

  destroy(): void { this.live.forEach(o => o.destroy()); this.live.clear(); }
}

// ---------- 道具：骷髅王扔过来 ----------
// 每种玩法的道具（轨道、鼓、打击框……）放进一个容器，容器的原点就是它该在的位置（anchor）。
// 轮到这种玩法时骷髅王把它扔过来：从他手里划一道弧线、转着、由小变大地落到位；轮完原地缩小淡出。

/** 扔过来用多久（毫秒）、弧线多高（像素）、出手时多小、转几度；收走用多久（毫秒） */
const TOSS = { ms: 650, arc: 120, from: 0.15, spin: -300, outMs: 200 };

/** 建一个道具容器：原点在 (x, y)，里面的东西用相对它的坐标。先藏着 */
export function makeKit(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
  return scene.add.container(x, y).setDepth(depth).setVisible(false).setData('anchor', { x, y });
}

/** 把道具从 from 扔到它该在的位置 */
export function tossIn(scene: Phaser.Scene, kit: Phaser.GameObjects.Container, from: { x: number; y: number }): void {
  const to = kit.getData('anchor') as { x: number; y: number }, k = { t: 0 };
  (kit.getData('toss') as Phaser.Tweens.Tween | undefined)?.stop();
  kit.setVisible(true).setAlpha(1);
  const place = () => {
    kit.setPosition(Phaser.Math.Linear(from.x, to.x, k.t), Phaser.Math.Linear(from.y, to.y, k.t) - Math.sin(Math.PI * k.t) * TOSS.arc);
    kit.setScale(TOSS.from + (1 - TOSS.from) * k.t).setAngle((1 - k.t) * TOSS.spin);
  };
  place();
  kit.setData('toss', scene.tweens.add({ targets: k, t: 1, duration: TOSS.ms, ease: 'Cubic.easeOut', onUpdate: place, onComplete: place }));
}

/** 把道具收走：原地缩小淡出 */
export function tossOut(scene: Phaser.Scene, kit: Phaser.GameObjects.Container): void {
  (kit.getData('toss') as Phaser.Tweens.Tween | undefined)?.stop();
  if (!kit.visible) return;
  kit.setData('toss', scene.tweens.add({ targets: kit, alpha: 0, scale: 0.7, duration: TOSS.outMs, onComplete: () => kit.setVisible(false) }));
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

  destroy(): void { this.scene.tweens.killTweensOf(this.shape); this.shape.destroy(); }
}
