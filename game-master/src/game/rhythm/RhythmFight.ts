// ===== 节奏关卡（游戏这一侧，也是整场的主持）：骷髅王在房间右边弹钢琴，主角在左边跟着曲子玩，每一段换一种玩法 =====
// 流程：摆好场子（骷髅王和钢琴站在右边）→ 骷髅王问一句话 → 血条出现、曲子开始 → 一段段玩过去 → 结算。
// 谱面（rhythm/charts）分成几段：2D 的段落（realm = flat）在这里、在游戏画面里玩；轮到 3D 的段落（realm = deep）就让主角破屏跳出去，
// 由舞台那边的 RhythmWorld 接着玩，轮完再回来。两边听同一个指挥（曲子现在第几毫秒）、记同一份成绩（rhythm/session）。
// 不扣心：每个音符判 Perfect / Good / Miss，分数往过关线每走一步，骷髅王的血条掉一格；谱面走完时血条空了算赢。
import Phaser from 'phaser';
import type { GameConfig } from '@/type';
import { bridge, EVT, STAGE_FX } from '@/protocol';
import { beatMs, beginRhythm, chartById, createHitsound, endRhythm, LANE_ARROWS, LANE_KEYS, RHYTHM_MODES, sectionAt, sectionStarts, travelMsOf, type Chart, type Hitsound, type Judgement, type ModeId, type RhythmSession } from '@/rhythm';
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
  /** 人这次出场落在哪（出场动画里人被骷髅手拎在半空，不能看他现在的位置）；这一点正下方的地面有多高（y） */
  standAt: () => { x: number; y: number };
  groundBelow: (x: number, y: number) => number;
  /** 现在能不能开（人归玩家管、站在地上） */
  canStart: () => boolean;
  /** 人在不在画面外（3D 世界）；让他从画面的这个位置跳出去 */
  away: () => boolean;
  popOut: (from: { x: number; y: number }) => void;
  /** 开打前骷髅王说一句（台词的 i18n key），说完调 done */
  say: (line: string, done: () => void) => void;
  /** 开始 / 结束：这一层的音乐让位、回来 */
  onBegin(): void;
  onEnd(): void;
  /** 换了一种玩法 */
  onMode(mode: ModeId): void;
  /** 换到这种玩法时骷髅王喊的那句话 */
  taunt: (mode: ModeId) => string;
  /** 成绩变了（给 HUD）：judge = 这一下的判定，null = 只是分数变了（自动判的，不弹字）；整个是 null = 收起来 */
  onScore(s: { points: number; combo: number; judge: Judgement | null; fresh?: boolean } | null): void;
  /** 骷髅王的血条；null = 收起来 */
  onBoss(v: { hp: number; max: number } | null): void;
  /** 破屏的那一刻：整个画面闪一下 */
  onBreak(): void;
  /** 结束：过没过关、拿到满分的百分之几 */
  onResult(won: boolean, percent: number): void;
}

/** 键盘上哪些键算哪个方向（KeyboardEvent.code）；空格、四条道的键（Q W E R）单算 */
const DIRS = { left: ['KeyA', 'ArrowLeft'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], right: ['KeyD', 'ArrowRight'] } as const;
const DIR_ORDER = ['left', 'up', 'down', 'right'] as const;
/** 打中时替身鼓到几倍、多久鼓到头（毫秒，再用同样久缩回去） */
const PUNCH = { scale: 1.25, ms: 55 };
/** 画在哪一层（盖住房间里的东西）；开打后房间压暗多少；开场那句话的 key；破屏前多久开始震、震多大 */
const DEPTH = 40, DIM = 0.35, INTRO_LINE = 'dialogue.festival.0', RUMBLE = { ms: 600, strength: 0.007 };

/** off = 没有；staged = 场子摆好了，骷髅王站着等；intro = 他在说话；play = 在打 */
type Phase = 'off' | 'staged' | 'intro' | 'play';

export class RhythmFight {
  private phase: Phase = 'off';
  private chart: Chart | null = null;
  /** 摆好场子之后，人一能动就开打 */
  private autoStart = false;
  private session: RhythmSession | null = null;
  private piano: PianoBoss | null = null;
  private room: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ground = 0;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  /** 每个 2D 段落一个玩法实例（下标 = 第几段） */
  private modes = new Map<number, FlatMode>();
  private section = -1;
  private stopping = false;
  /** 下一次破屏前的震动已经起过了（记的是那一段的下标） */
  private rumbled = -1;
  /** 主角的替身：2D 的玩法挪的是它。真的主角藏在原地不动（挪他会揭开迷雾、换房间），打完再露出来 */
  private hero: Phaser.GameObjects.Image | null = null;
  private hitsound: Hitsound | null = null;
  /** 键盘上刚按下、还没被读走的键（KeyboardEvent.code）；上一帧按着的方向（手柄、触屏靠它认出「刚按下」） */
  private readonly tapped = new Set<string>();
  private was: MoveInput = { left: false, right: false, up: false, down: false };
  private readonly onKey = (e: KeyboardEvent): void => { if (!e.repeat) this.tapped.add(e.code); };

  constructor(private readonly d: RhythmFightDeps) {}

  /** 骷髅王在说话或者正在打：按键归节奏关卡，人不归玩家管 */
  get active(): boolean { return this.phase === 'intro' || this.phase === 'play'; }

  /** 摆好场子：骷髅王和钢琴站到房间右边。auto = 人一能动就开打 */
  stage(chartId: string, auto: boolean): void {
    const chart = chartById(chartId), { scene, cfg } = this.d;
    if (!chart || this.phase !== 'off') return;
    const cam = scene.cameras.main, at = this.d.standAt();
    this.chart = chart; this.autoStart = auto; this.phase = 'staged';
    this.room = { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height };
    this.ground = this.d.groundBelow(at.x, at.y);
    this.piano = new PianoBoss(scene, this.room, this.ground, cfg.tile, DEPTH);
  }

  /** 开一场：场子还没摆就先摆；已经在说话 / 在打就不管 */
  start(chartId: string): void {
    if (this.phase === 'off') this.stage(chartId, true);
    else if (this.phase === 'staged') this.autoStart = true;
  }

  /** 中途退出 */
  stop(): void { if (this.phase === 'play') this.stopping = true; }

  /** 每帧 */
  update(): void {
    const cfg = this.d.cfg.world3d.rhythm;
    if (this.phase === 'off') return;
    if (this.phase === 'staged' && this.autoStart && this.d.canStart()) { this.intro(); return; }
    if (this.phase !== 'play') { this.piano?.update(0, null, cfg); return; }
    const s = this.session!, now = s.conductor.timeMs(), away = this.d.away();
    if (this.stopping || s.conductor.finished) {
      // 人还在画面外：等他回来（谱面走完了他自己会回；中途退出的请他回）
      if (away) { if (this.stopping) bridge.emit(EVT.stageFxEnd, { id: STAGE_FX.world }); return; }
      this.finish();
      return;
    }
    const section = sectionAt(s.chart, now), realm = (i: number) => RHYTHM_MODES[s.chart.sections[i].mode].realm;
    if (section !== this.section) {
      this.modes.get(this.section)?.setActive(false);
      this.modes.get(section)?.setActive(true);
      this.section = section;
      this.d.onMode(s.chart.sections[section].mode);
      this.piano?.shout(this.d.taunt(s.chart.sections[section].mode));
      if (realm(section) === 'deep' && !away) this.d.onBreak();   // 破屏的那一刻
    }
    // 快要破屏了：画面先震起来
    const next = section + 1;
    if (next < s.chart.sections.length && realm(next) === 'deep' && realm(section) === 'flat' && this.rumbled !== next && sectionStarts(s.chart)[next] - now < RUMBLE.ms) {
      this.rumbled = next;
      this.d.scene.cameras.main.shake(RUMBLE.ms, RUMBLE.strength);
    }
    // 轮到 3D 的段落：人还在画面里就让他从替身那跳出去（每段开头空着的那一小节里飞过去）
    const hero = this.hero!, p = this.d.player();
    if (realm(section) === 'deep' && !away) this.d.popOut({ x: hero.x, y: hero.y });
    const press = this.readPress();
    // 人在画面里：真的主角一直藏着、不让他自己走（从画面外回来时会被放出来），画面上是替身；跳出去了替身也收起来
    if (!away) { p.setVisible(false); p.body.moves = false; p.setVelocity(0, 0); }
    hero.setVisible(!away);
    if (!away) this.modes.get(section)?.update(now, press);
    this.modes.forEach(m => m.draw(now));
    this.piano?.update(now, s, cfg);
    this.sway(now);
  }

  /** 骷髅王在操控画面：每拍放大一下再收回去，左右慢慢晃（两小节一个来回） */
  private sway(now: number): void {
    const s = this.session!, cfg = this.d.cfg.world3d.rhythm.sway, cam = this.d.scene.cameras.main;
    const beats = (now - s.chart.offsetMs) / beatMs(s.chart), phase = ((beats % 1) + 1) % 1;
    cam.setZoom(1 + (beats >= 0 ? cfg.zoom * Math.exp(-phase * 5) : 0));
    cam.setRotation(Phaser.Math.DegToRad(cfg.rollDeg) * Math.sin(beats / 8 * Math.PI * 2));
  }

  destroy(): void {
    if (this.session) endRhythm();
    this.clearFight();
    this.piano?.destroy(); this.piano = null;
    this.phase = 'off';
  }

  /** 骷髅王说一句，说完开打 */
  private intro(): void {
    this.phase = 'intro';
    const p = this.d.player();
    p.setVelocity(0, 0); p.body.moves = false; p.setFlipX(false);   // 站住，脸朝着他
    this.d.say(INTRO_LINE, () => { if (this.phase === 'intro') this.play(); });
  }

  private play(): void {
    const chart = this.chart!, { scene, cfg } = this.d, room = this.room;
    const session = beginRhythm(chart, import.meta.env.BASE_URL + chart.audio, cfg.musicVolume);
    if (!session) { this.phase = 'staged'; this.autoStart = false; this.d.player().unfreeze(); return; }
    this.session = session; this.section = -1; this.stopping = false; this.rumbled = -1; this.phase = 'play';
    this.backdrop = scene.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, Colors.ink, DIM).setDepth(DEPTH - 2);

    const p = this.d.player(), piano = this.piano!;
    p.freeze(0xffffff); p.clearTint(); p.setVisible(false);
    const hero = this.hero = scene.add.image(p.x, p.y, p.texture.key).setDisplaySize(p.displayWidth, p.displayHeight).setFlipX(false).setDepth(DEPTH + 2);
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
        scene, room, ground: this.ground, heroX: p.x, source: { x: piano.rect.x, y: piano.rect.y }, boss: piano.hand, tile: cfg.tile, depth: DEPTH, hero, score: session.score,
        travelMs: travelMsOf(chart, s.mode, rc().travelBeats), beat: { ms: beatMs(chart), offsetMs: chart.offsetMs }, config: rc, punch,
      }, session.notes.filter(n => n.section === i)));
    });
    // 每次判定：当场出一声、HUD 上弹字（自动判的——躲过去的弹幕——不出声不弹字，只记分）；血条跟着分数掉
    const hitsound = this.hitsound = createHitsound(cfg.musicVolume);
    session.score.listen((j, by) => {
      if (by === 'press') hitsound.play(j);
      this.d.onScore({ points: session.score.points, combo: session.score.combo, judge: by === 'press' ? j : null });
      this.d.onBoss(this.bossHp());
    });
    this.d.onScore({ points: 0, combo: 0, judge: null, fresh: true });
    this.d.onBoss(this.bossHp());
    scene.input.keyboard?.on('keydown', this.onKey);
    this.d.onBegin();
    session.conductor.start();
  }

  /** 骷髅王还剩几格血：分数走到过关线的几成，血就掉几成 */
  private bossHp(): { hp: number; max: number } {
    const cfg = this.d.cfg.world3d.rhythm, max = cfg.bossHp;
    return { hp: max - Math.floor(max * Math.min(1, this.session!.score.ratio / cfg.passRatio)), max };
  }

  /** 这一帧刚按下的键：键盘按下的那一刻就记着（按得再快也不漏），手柄、触屏看按着的状态有没有变 */
  private readPress(): Press {
    const h = this.d.held(), w = this.was, t = this.tapped;
    const key = (dir: typeof DIR_ORDER[number]) => DIRS[dir].some(c => t.has(c));
    /** 这个方向刚按下：键盘的按键事件，或者按着的状态变了（手柄、触屏） */
    const dir = (d: typeof DIR_ORDER[number]) => key(d) || (h[d] && !w[d]);
    const press: Press = {
      left: dir('left'), right: dir('right'), up: dir('up'), down: dir('down'), jump: t.has('Space'),
      // 四条道：Q W E R、方向键，或者手柄 / 触屏的方向（键盘上的 A S D 不算：它们不在一排上）
      lanes: DIR_ORDER.map((d, i) => t.has(LANE_KEYS[i].code) || t.has(LANE_ARROWS[i]) || (h[d] && !w[d] && !key(d))),
      held: h,
    };
    this.was = { ...h }; t.clear();
    return press;
  }

  private finish(): void {
    const s = this.session!, cfg = this.d.cfg.world3d.rhythm;
    // 中途退出的不算过关；没打到的音符本来就没得分
    const won = !this.stopping && s.score.ratio >= cfg.passRatio, percent = Math.round(s.score.ratio * 100);
    endRhythm();
    this.clearFight();
    this.phase = 'staged'; this.autoStart = false;   // 骷髅王还站在那：再开一场就再打一遍
    this.d.onScore(null);
    this.d.onBoss(null);
    this.d.onEnd();
    this.d.onResult(won, percent);
    bridge.emit(EVT.rhythmEnd, { won });
  }

  /** 收掉一场里的东西（骷髅王和钢琴留着） */
  private clearFight(): void {
    this.d.scene.input.keyboard?.off('keydown', this.onKey);
    this.modes.forEach(m => m.destroy()); this.modes.clear();
    this.piano?.reset();
    this.backdrop?.destroy(); this.backdrop = null;
    this.d.scene.cameras.main?.setZoom(1).setRotation(0);   // 场景关闭时镜头已经没了
    if (this.hero) this.d.scene.tweens.killTweensOf(this.hero);
    this.hero?.destroy(); this.hero = null;
    this.hitsound?.close(); this.hitsound = null;
    const wasPlaying = this.session !== null;
    this.session = null; this.tapped.clear();
    if (wasPlaying || this.phase === 'intro') { const p = this.d.player(); p.setVisible(true); p.unfreeze(); }
  }
}
