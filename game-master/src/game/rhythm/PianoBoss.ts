// ===== Game Master 和他的钢琴：站在房间右边的地上（节奏关卡里 2D 画面上一直在的那部分）=====
// Game Master 是一副会动的骨架（BossRig）。一开始只有他站着；说完开场白，他双手一举、往下一按，把钢琴变出来，然后开弹。
// 画面上的东西都是他当场弄出来的：每个音符出发的那一刻，他有一只手敲在对应的琴键上（琴键亮一下），音符从那里出来；
// 没有音符的拍子他也照着拍子弹；换玩法时他甩手把道具扔过来。
// 3D 段落里从画面飞出去的音符（rhythm/modes.ts 的 fromScreen），先在画面里从钢琴落到画面底边对应的那条道上，
// 落到底的那一刻正好是它在 3D 里从屏幕冒出来的时刻，接得上。
import Phaser from 'phaser';
import type { RhythmConfig } from '@/type';
import { beatMs, RHYTHM_MODES, travelMsOf, type Note, type RhythmSession } from '@/rhythm';
import { Colors } from '@/game/palette';
import { BossRig } from './BossRig';

/** 游戏世界里的一块矩形（像素） */
export interface Rect { x: number; y: number; w: number; h: number }

/** Game Master 站在房间的多靠右（宽度的比例）、放大几倍 */
const BOSS = { x: 0.86, scale: 3 };
/** 钢琴（在他左手边）：离他多远、多宽、多高、琴键那一条多厚（格），几个白键；落下来的音符多大（像素） */
const PIANO = { gap: 1.6, width: 3.4, height: 1.5, keys: 0.4, count: 10, drop: 20 };
/** 喊话：字多大（格）、在头顶上多高（格）、弹出来再飘走一共多久（毫秒） */
const SHOUT = { size: 0.85, lift: 0.6, ms: 1500 };
/**
 * 动作的时长（毫秒）：变钢琴——双手举起来多久、按下去钢琴弹出来多久；敲一下琴键手下去再抬起来多久、琴键亮多久；
 * 甩手扔东西手举着多久。敲琴键时手抬多高、平时悬在琴键上多高（格）
 */
const ACT = { raiseMs: 320, popMs: 380, strikeMs: 150, keyMs: 140, throwMs: 300, hover: 0.5, lift: 0.9 };

export class PianoBoss {
  private readonly rig: BossRig;
  private readonly piano: Phaser.GameObjects.Container;
  private readonly keys: Phaser.GameObjects.Rectangle[];
  /** 琴键那一条占的矩形：音符从这出来 */
  readonly rect: Rect;
  /** 钢琴变出来了 */
  private hasPiano = false;
  /** 正在画面里往下落的音符 */
  private drops: { note: Note; dot: Phaser.GameObjects.Rectangle }[] = [];
  /** 下一个还没落的音符（3D 的段落）、下一个还没出发的音符（2D 的段落） */
  private next = 0;
  private nextFlat = 0;
  /** 每只手：正在敲的那个琴键在第几个（-1 = 没在敲）、敲下去的时刻；甩手到什么时候（真实时间，毫秒） */
  private readonly strikes = [{ key: -1, at: 0 }, { key: -1, at: 0 }];
  private throwUntil = 0;
  private lastBeat = -1;
  private turn = 0;

  /** @param ground 地面的 y；tile 一格多少像素；depth 画在哪一层 */
  constructor(private readonly scene: Phaser.Scene, private readonly room: Rect, private readonly ground: number, private readonly tile: number, private readonly depth: number) {
    const bx = room.x + room.w * BOSS.x, pw = PIANO.width * tile, ph = PIANO.height * tile, px = bx - PIANO.gap * tile - pw;
    this.rect = { x: px, y: ground - ph, w: pw, h: PIANO.keys * tile };
    this.rig = new BossRig(scene, bx, ground, BOSS.scale, depth - 1);
    // 钢琴：原点在底边中点，先藏着（缩成一点），等他变出来
    const keyW = pw / PIANO.count;
    const body = scene.add.rectangle(0, -ph / 2, pw, ph, Colors.ink).setStrokeStyle(2, Colors.paper);
    this.keys = Array.from({ length: PIANO.count }, (_, i) => scene.add.rectangle(-pw / 2 + (i + 0.5) * keyW, -ph + this.rect.h / 2, keyW - 2, this.rect.h, Colors.paper));
    this.piano = scene.add.container(px + pw / 2, ground, [body, ...this.keys]).setDepth(depth).setScale(0).setVisible(false);
  }

  /** Game Master 的手在哪（道具从这扔出来）、身体中间在哪（砍回去的方块往这砸） */
  get hand(): { x: number; y: number } { return { x: this.rig.root.x - this.tile, y: this.ground - this.rig.height * 0.75 }; }
  get body(): { x: number; y: number } { return { x: this.rig.root.x, y: this.ground - this.rig.height / 2 }; }

  setTalking(on: boolean): void { this.rig.setTalking(on); }

  /** 把钢琴变出来：双手举过头顶，往下一按，钢琴从地上弹出来；弹完调 done */
  summon(done: () => void): void {
    if (this.hasPiano) { done(); return; }
    const up = { x: this.rect.x + this.rect.w / 2, y: this.ground - this.rig.height * 1.15 };
    this.rig.reach(0, up); this.rig.reach(1, { x: up.x + this.tile, y: up.y });
    this.scene.time.delayedCall(ACT.raiseMs, () => {
      this.hasPiano = true;
      this.piano.setVisible(true);
      this.scene.tweens.add({ targets: this.piano, scale: 1, duration: ACT.popMs, ease: 'Back.easeOut', onComplete: done });
      this.scene.cameras.main.shake(120, 0.004);
    });
  }

  /** 挨了一下 */
  flinch(): void { this.rig.flinch(); }

  /** 甩手扔东西（换玩法时把道具扔过去）：右手举起来往前一甩 */
  throwProp(): void { this.throwUntil = this.scene.time.now + ACT.throwMs; }

  /** Game Master 喊一句：字从他头顶弹出来，往上飘着淡掉 */
  shout(text: string): void {
    const y = this.ground - this.rig.height - SHOUT.lift * this.tile;
    const label = this.scene.add.text(this.rig.root.x, y, text, { fontFamily: 'monospace', fontSize: `${Math.round(SHOUT.size * this.tile)}px`, fontStyle: 'bold', color: '#ffd166', stroke: '#0b0b14', strokeThickness: 6 })
      .setOrigin(0.85, 1).setDepth(this.depth + 3).setScale(0.3);
    this.scene.tweens.add({ targets: label, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: label, y: y - this.tile, alpha: 0, delay: SHOUT.ms * 0.55, duration: SHOUT.ms * 0.45, onComplete: () => label.destroy() });
  }

  /** 每帧。session = 正在打的那一场（没开打是 null：站着不动） */
  update(now: number, session: RhythmSession | null, cfg: RhythmConfig): void {
    const real = this.scene.time.now;
    if (!session) { this.pose(real); this.rig.update(null); return; }
    const { chart, notes } = session, beat = beatMs(chart), beats = (now - chart.offsetMs) / beat;
    const modeOf = (n: Note) => chart.sections[n.section].mode, travel = (n: Note) => travelMsOf(chart, modeOf(n), cfg.travelBeats);
    // 2D 段落的音符：出发的那一刻敲对应的琴键（音符就是这么弹出来的）
    while (this.nextFlat < notes.length && notes[this.nextFlat].timeMs - travel(notes[this.nextFlat]) <= now) {
      const n = notes[this.nextFlat++], spec = RHYTHM_MODES[modeOf(n)];
      if (spec.realm === 'flat' && now - (n.timeMs - travel(n)) < beat) this.strike((n.lane + 0.5) / spec.lanes, real);
    }
    // 该往画面外落的音符（3D 段落）：到达时刻往前推「在 3D 里飞的时间 + 在画面里落的时间」就开始落，同时敲一下琴键
    const fall = cfg.dropBeats * beat, leaves = (n: Note) => n.timeMs - travel(n) - fall;
    while (this.next < notes.length && leaves(notes[this.next]) <= now) {
      const note = notes[this.next++], spec = RHYTHM_MODES[modeOf(note)];
      if (!spec.fromScreen) continue;
      this.strike((note.lane + 0.5) / spec.lanes, real);
      const dot = this.scene.add.rectangle(0, 0, PIANO.drop, PIANO.drop, note.char === '_' ? Colors.gold : Colors.rose).setDepth(this.depth + 1);
      this.drops.push({ note, dot });
    }
    const from = this.rect, r = this.room;
    this.drops = this.drops.filter(({ note, dot }) => {
      const k = (now - leaves(note)) / fall;
      if (k >= 1) { dot.destroy(); return false; }
      const u = (note.lane + 0.5) / RHYTHM_MODES[modeOf(note)].lanes;
      // 从敲的那个琴键上弹起来，划一道弧线落到画面底边那条道上
      dot.setPosition(Phaser.Math.Linear(from.x + u * from.w, r.x + u * r.w, k), Phaser.Math.Linear(from.y, r.y + r.h, k * k) - Math.sin(Math.PI * k) * from.h * 6);
      return true;
    });
    // 没有音符的拍子也照着弹：每拍两只手轮着敲一下
    const b = Math.floor(beats);
    if (b > this.lastBeat && b >= 0) { this.lastBeat = b; if (this.strikes.every(s => real - s.at > beat * 0.4)) this.strike(0.25 + 0.5 * ((b * 7) % 10) / 10, real); }
    this.pose(real);
    this.rig.update(beats < 0 ? null : ((beats % 1) + 1) % 1);
  }

  /** 没在打的时候敲一下琴键（引子里放板）：u = 在琴键上的哪 */
  tap(u: number): void { this.strike(u, this.scene.time.now); }

  /** 敲一下琴键：u = 在琴键上的哪（0 左头 … 1 右头）。两只手轮着来 */
  private strike(u: number, real: number): void {
    if (!this.hasPiano) return;
    const hand = this.turn = 1 - this.turn, key = Phaser.Math.Clamp(Math.floor(u * PIANO.count), 0, PIANO.count - 1);
    this.strikes[hand] = { key, at: real };
    const k = this.keys[key];
    this.scene.tweens.killTweensOf(k);
    k.setFillStyle(Colors.gold);
    this.scene.tweens.add({ targets: k, alpha: { from: 1, to: 1 }, duration: ACT.keyMs, onComplete: () => k.setFillStyle(Colors.paper) });
  }

  /** 两只手这一帧要去哪：没钢琴就垂着；有钢琴就悬在琴键上，敲的时候下去一下；甩手的时候右手举起来 */
  private pose(real: number): void {
    if (!this.hasPiano) return;
    const keyW = this.rect.w / PIANO.count;
    for (const i of [0, 1]) {
      const s = this.strikes[i], since = real - s.at, striking = s.key >= 0 && since < ACT.strikeMs;
      const key = s.key >= 0 ? s.key : i === 0 ? 2 : PIANO.count - 3;
      // 敲：手从悬着的高度下去、再抬起来（中间那一刻正好按到琴键）
      const lift = striking ? ACT.hover * Math.abs(1 - since / (ACT.strikeMs / 2)) : ACT.hover;
      this.rig.reach(i, { x: this.rect.x + (key + 0.5) * keyW, y: this.rect.y - lift * this.tile });
    }
    if (real < this.throwUntil) this.rig.reach(1, { x: this.rig.root.x - this.tile * 1.5, y: this.ground - this.rig.height - ACT.lift * this.tile });
  }

  /** 一场打完：还没落完的收掉，下一场从头数（钢琴留着） */
  reset(): void {
    this.drops.forEach(d => d.dot.destroy()); this.drops = [];
    this.next = 0; this.nextFlat = 0; this.lastBeat = -1;
    this.strikes.forEach(s => { s.key = -1; });
  }

  destroy(): void { this.reset(); this.scene.tweens.killTweensOf(this.keys); this.scene.tweens.killTweensOf(this.piano); this.piano.destroy(); this.rig.destroy(); }
}
