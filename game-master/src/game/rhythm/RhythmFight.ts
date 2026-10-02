// ===== 节奏关卡（游戏这一侧，也是整场的主持）：骷髅王在房间里弹钢琴，主角跟着曲子玩，每一段换一种玩法 =====
// 谱面（rhythm/charts）分成几段：2D 的段落（realm = flat）在这里、在游戏画面里玩；轮到 3D 的段落（realm = deep）就让主角破屏跳出去，
// 由舞台那边的 RhythmWorld 接着玩，轮完再回来。两边听同一个指挥（曲子现在第几毫秒）、记同一份成绩（rhythm/session）。
// 不扣心：每个音符判 Perfect / Good / Miss，谱面走完时拿到满分的 config.world3d.rhythm.passRatio 以上算过关。
import Phaser from 'phaser';
import type { GameConfig } from '@/type';
import { bridge, EVT, STAGE_FX } from '@/protocol';
import { beatMs, beginRhythm, chartById, createHitsound, endRhythm, RHYTHM_MODES, sectionAt, type Hitsound, type Judgement, type ModeId, type RhythmSession } from '@/rhythm';
import type { MoveInput } from '@/game/mechanics/define';
import type { Player } from '@/sprite';
import { Colors } from '@/game/palette';
import { PianoBoss, type Rect } from './PianoBoss';
import { createFlatMode, type FlatMode, type Press } from './modes/define';
import './modes';

export interface RhythmFightDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  player: () => Player;
  /** 现在按着哪些方向（键盘、手柄、触屏合起来） */
  held: () => MoveInput;
  /** 现在能不能开（人归玩家管） */
  canStart: () => boolean;
  /** 人在不在画面外（3D 世界）；让他从画面的这个位置跳出去 */
  away: () => boolean;
  popOut: (from: { x: number; y: number }) => void;
  /** 开始 / 结束：这一层的音乐让位、回来 */
  onBegin(): void;
  onEnd(): void;
  /** 换了一种玩法 */
  onMode(mode: ModeId): void;
  /** 成绩变了（给 HUD）：judge = 这一下的判定，null = 只是分数变了（自动判的，不弹字）；整个是 null = 收起来 */
  onScore(s: { points: number; combo: number; judge: Judgement | null; fresh?: boolean } | null): void;
  /** 结束：过没过关、拿到满分的百分之几 */
  onResult(won: boolean, percent: number): void;
}

/** 键盘上哪些键算什么（KeyboardEvent.code）：四条道从左到右是 A W S D，方向键同理；空格单算 */
const KEYS: Record<string, keyof Press> = {
  KeyA: 'left', ArrowLeft: 'left', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyD: 'right', ArrowRight: 'right', Space: 'jump',
};
/** 打中时替身鼓到几倍、多久鼓到头（毫秒，再用同样久缩回去） */
const PUNCH = { scale: 1.25, ms: 55 };
/** 画在哪一层（盖住房间里的东西）；房间压暗多少 */
const DEPTH = 40, DIM = 0.82;

export class RhythmFight {
  private session: RhythmSession | null = null;
  private piano: PianoBoss | null = null;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  /** 每个 2D 段落一个玩法实例（下标 = 第几段） */
  private modes = new Map<number, FlatMode>();
  private section = -1;
  private stopping = false;
  /** 主角的替身：2D 的玩法挪的是它。真的主角藏在原地不动（挪他会揭开迷雾、换房间），打完再露出来 */
  private hero: Phaser.GameObjects.Image | null = null;
  private hitsound: Hitsound | null = null;
  /** 键盘上刚按下、还没被读走的方向；上一帧按着的方向（手柄、触屏靠它认出「刚按下」） */
  private readonly tapped = new Set<keyof Press>();
  private was: MoveInput = { left: false, right: false, up: false, down: false };
  private readonly onKey = (e: KeyboardEvent): void => { const k = KEYS[e.code]; if (k && !e.repeat) this.tapped.add(k); };

  constructor(private readonly d: RhythmFightDeps) {}

  /** 有一场在进行 */
  get active(): boolean { return this.session !== null; }

  /** 开一场；已经有一场、没有这张谱、现在开不了，就不开 */
  start(chartId: string): void {
    const chart = chartById(chartId), { scene, cfg } = this.d;
    if (this.session || !chart || !this.d.canStart()) return;
    const session = beginRhythm(chart, import.meta.env.BASE_URL + chart.audio, cfg.musicVolume);
    if (!session) return;
    this.session = session; this.section = -1; this.stopping = false;
    const cam = scene.cameras.main, room: Rect = { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height };
    this.backdrop = scene.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, Colors.ink, DIM).setDepth(DEPTH - 2);
    this.piano = new PianoBoss(scene, session, room, DEPTH);

    const p = this.d.player();
    p.freeze(0xffffff); p.clearTint(); p.setVisible(false);
    const hero = this.hero = scene.add.image(p.x, p.y, p.texture.key).setDisplaySize(p.displayWidth, p.displayHeight).setFlipX(p.flipX).setDepth(DEPTH + 2);
    const rc = () => this.d.cfg.world3d.rhythm;
    const baseX = hero.scaleX, baseY = hero.scaleY;
    const punch = () => {
      scene.tweens.killTweensOf(hero);
      hero.setScale(baseX, baseY);
      scene.tweens.add({ targets: hero, scaleX: baseX * PUNCH.scale, scaleY: baseY * PUNCH.scale, duration: PUNCH.ms, yoyo: true });
    };
    chart.sections.forEach((s, i) => {
      if (RHYTHM_MODES[s.mode].realm !== 'flat') return;
      this.modes.set(i, createFlatMode(s.mode, {
        scene, room, piano: this.piano!.rect, tile: cfg.tile, depth: DEPTH, hero, score: session.score,
        travelMs: rc().travelBeats * beatMs(chart), config: rc, punch,
      }, session.notes.filter(n => n.section === i)));
    });
    // 每次判定：当场出一声、HUD 上弹字（自动判的——躲过去的弹幕——不出声不弹字，只记分）
    const hitsound = this.hitsound = createHitsound(cfg.musicVolume);
    session.score.listen((j, by) => {
      if (by === 'press') hitsound.play(j);
      this.d.onScore({ points: session.score.points, combo: session.score.combo, judge: by === 'press' ? j : null });
    });
    this.d.onScore({ points: 0, combo: 0, judge: null, fresh: true });
    scene.input.keyboard?.on('keydown', this.onKey);
    this.d.onBegin();
    session.conductor.start();
  }

  /** 中途退出 */
  stop(): void { if (this.session) this.stopping = true; }

  /** 每帧 */
  update(): void {
    const s = this.session;
    if (!s) return;
    const now = s.conductor.timeMs(), away = this.d.away();
    if (this.stopping || s.conductor.finished) {
      // 人还在画面外：等他回来（谱面走完了他自己会回；中途退出的请他回）
      if (away) { if (this.stopping) bridge.emit(EVT.stageFxEnd, { id: STAGE_FX.world }); return; }
      this.finish();
      return;
    }
    const section = sectionAt(s.chart, now);
    if (section !== this.section) {
      this.modes.get(this.section)?.setActive(false);
      this.modes.get(section)?.setActive(true);
      this.section = section;
      this.d.onMode(s.chart.sections[section].mode);
    }
    // 轮到 3D 的段落：人还在画面里就让他跳出去（每段开头空着的那一小节里飞过去）
    const deep = RHYTHM_MODES[s.chart.sections[section].mode].realm === 'deep';
    const hero = this.hero!, p = this.d.player();
    if (deep && !away) this.d.popOut({ x: hero.x, y: hero.y });
    const press = this.readPress();
    // 人在画面里：真的主角一直藏着、不让他自己走（从画面外回来时会被放出来），画面上是替身；跳出去了替身也收起来
    if (!away) { p.setVisible(false); p.body.moves = false; p.setVelocity(0, 0); }
    hero.setVisible(!away);
    if (!away) this.modes.get(section)?.update(now, press);
    this.modes.forEach(m => m.draw(now));
    this.piano?.update(now, this.d.cfg.world3d.rhythm);
  }

  destroy(): void { if (this.session) { endRhythm(); this.clear(); } }

  /** 这一帧刚按下的方向：键盘按下的那一刻就记着（按得再快也不漏），手柄、触屏看按着的状态有没有变 */
  private readPress(): Press {
    const h = this.d.held(), w = this.was, t = this.tapped;
    const press = { left: (h.left && !w.left) || t.has('left'), right: (h.right && !w.right) || t.has('right'), up: (h.up && !w.up) || t.has('up'), down: (h.down && !w.down) || t.has('down'), jump: t.has('jump') };
    this.was = { ...h }; t.clear();
    return press;
  }

  private finish(): void {
    const s = this.session!, cfg = this.d.cfg.world3d.rhythm;
    // 中途退出的不算过关；没打到的音符本来就没得分
    const won = !this.stopping && s.score.ratio >= cfg.passRatio, percent = Math.round(s.score.ratio * 100);
    endRhythm();
    this.clear();
    this.d.onScore(null);
    this.d.onEnd();
    this.d.onResult(won, percent);
    bridge.emit(EVT.rhythmEnd, { won });
  }

  private clear(): void {
    this.d.scene.input.keyboard?.off('keydown', this.onKey);
    this.modes.forEach(m => m.destroy()); this.modes.clear();
    this.piano?.destroy(); this.piano = null;
    this.backdrop?.destroy(); this.backdrop = null;
    this.session = null; this.tapped.clear();
    if (this.hero) this.d.scene.tweens.killTweensOf(this.hero);
    this.hero?.destroy(); this.hero = null;
    this.hitsound?.close(); this.hitsound = null;
    const p = this.d.player();
    p.setVisible(true); p.unfreeze();
  }
}
