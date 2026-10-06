// ===== 节奏关卡（游戏这一侧，也是整场的主持）：Game Master 在房间右边弹钢琴，主角在左边跟着曲子玩，每一段换一种玩法 =====
// 流程：摆好场子（Game Master 一个人站在右边）→ 他说开场白（跳一下翻一句，这时候人照常能跳）→ 安静一会 → 他把钢琴变出来 →
// 引子（Lure）：他弹一下放一块板，主角这时候是自由的；跳上哪一块，那一瞬间就被锁进来 →
// Game Master 的血条出现，一管管「滴滴滴」地填满（和史莱姆王出场用的是同一声）→ 曲子开始 → 一段段玩过去 → 结算。
// 谱面（rhythm/charts）分成几段：2D 的段落（realm = flat）在这里、在游戏画面里玩；轮到 3D 的段落（realm = deep）就让主角破屏跳出去，
// 由舞台那边的 RhythmWorld 接着玩，轮完再回来。两边听同一个指挥（曲子现在第几毫秒）、记同一份成绩（rhythm/session）。
// 每个音符判 Perfect / Good / Miss。Game Master 的血 = 整张谱音符数的六成（passRatio），接住一个掉一滴（HUD 上分成好几管）；谱面走完时血空了算赢。
// 2D 里接住的音符弹回去砸他。
import Phaser from 'phaser';
import type { GameConfig } from '@/type';
import { bridge, EVT, STAGE_FX, type RhythmTest } from '@/protocol';
import { beatMs, beginRhythm, chartById, createHitsound, endRhythm, LANE_ARROWS, LANE_KEYS, notesOf, RHYTHM_MODES, sectionAt, sectionStarts, travelMsOf, type Chart, type Hitsound, type Judgement, type ModeId, type RhythmSession, type Note } from '@/rhythm';
import type { MoveInput } from '@/game/mechanics/define';
import type { Player } from '@/sprite';
import { Colors } from '@/game/palette';
import { PianoBoss, type Rect } from './PianoBoss';
import { Lure } from './Lure';
import { createBossSound, type BossSound } from '@/audio/bossSound';
import { PILLAR } from './modes/giveup';
import { createFlatMode, type FlatMode, type Press } from './modes/define';
import './modes';
import { DEPTH } from '@/game/depth';

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
  /** Game Master 的开场白：前几句玩家跳一下翻一句；到了跳不过去的那几句调 locked（人不再归玩家管），全说完调 done */
  talk: (locked: () => void, done: () => void) => void;
  /** Game Master 在对话框里说一句（台词的 i18n key），显示 ms 毫秒，说完调 done */
  say: (line: string, ms: number, done: () => void) => void;
  /** 开始 / 结束：这一层的音乐让位、回来 */
  onBegin(): void;
  onEnd(): void;
  /** 换了一种玩法 */
  onMode(mode: ModeId): void;
  /** 换到这种玩法时 Game Master 喊的那句话 */
  taunt: (mode: ModeId) => string;
  /** 成绩变了（给 HUD）：judge = 这一下的判定，null = 只是分数变了（自动判的，不弹字）；整个是 null = 收起来 */
  onScore(s: { points: number; combo: number; judge: Judgement | null; fresh?: boolean } | null): void;
  /** Game Master 的血条；null = 收起来 */
  onBoss(v: { hp: number; max: number; per: number } | null): void;
  /** 主角的血（节奏关卡里是另一套：两滴一格）；null = 收起来，换回平时的心 */
  onHp(v: { hp: number; max: number } | null): void;
  /** 破屏的那一刻：整个画面闪一下 */
  onBreak(): void;
  /** 结束：过没过关、拿到满分的百分之几；test = 这一场是试玩（不算通关） */
  onResult(won: boolean, percent: number, test: boolean): void;
}

/** 键盘上哪些键算哪个方向（KeyboardEvent.code）；空格、四条道的键（Q W E R）单算 */
const DIRS = { left: ['KeyA', 'ArrowLeft'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], right: ['KeyD', 'ArrowRight'] } as const;
const DIR_ORDER = ['left', 'up', 'down', 'right'] as const;
/** 打中时替身鼓到几倍、多久鼓到头（毫秒，再用同样久缩回去） */
const PUNCH = { scale: 1.25, ms: 55 };
/** 起跳爆炸的那一声（asset 里的 key）、多响：和平时起跳一样 */
const BOOM = { key: 'boom', volume: 0.8 };
/** 接住的音符弹回去砸 Game Master：飞多久（毫秒）、弧线多高（格）、一路转多少度 */
const RETURN = { ms: 260, arc: 1.2, spin: 360 };
/**
 * 开打前血条一格一格填满，每格「滴」一声：第一管一格隔多久（毫秒）、每多一管快到上一管的几成、最快一格隔多久；
 * 每填满一管画面震多久、多大；全满之后停多久再起曲子
 */
const FILL = { cellMs: 70, faster: 0.82, minMs: 22, shake: { ms: 140, strength: 0.005 }, holdMs: 700 };
/** 画在哪一层（盖住房间里的东西，见 game/depth.ts）；开打后房间压暗多少；破屏前多久开始震、震多大 */
const FIGHT_DEPTH = DEPTH.rhythm, DIM = 0.35, RUMBLE = { ms: 600, strength: 0.007 };
/** 开场白说完之后安静多久（毫秒）；换段之前的那句话：提前几拍开始说、说到下一段开头再过几拍 */
const QUIET_MS = 1000, SAY = { leadBeats: 2, tailBeats: 3 };

/** off = 没有；staged = 场子摆好了，Game Master 站着等；intro = 他在说话、变钢琴；lure = 他在放板，等主角跳上去；fill = 踩上去了，血条在填（别的都不动）；play = 在打 */
type Phase = 'off' | 'staged' | 'intro' | 'lure' | 'fill' | 'play';

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
  /** 开场白还没说完：这时候人还归玩家管（跳一下翻一句） */
  private talking = false;
  private lure: Lure | null = null;
  /** 这一场 Game Master 一共多少血、一管多少滴（开场算一次）；HUD 上现在显示的是多少血 */
  private bossFull: { max: number; per: number } | null = null;
  private shownBossHp = -1;
  /** 等着开的试玩（技术验证编辑器点了「从这开始」）：手头的收干净、人回到画面里就开；正在打的这一场是不是试玩 */
  private pending: RhythmTest | null = null;
  private test: RhythmTest | null = null;
  /** 血条正在填：从哪一刻（真实时间）开始填的、上一次涨到了第几步；null = 没在填 */
  private fill: { last: number; hp: number; fullAt: number; sound: BossSound; max: number; per: number; on: { x: number; left: number; right: number } } | null = null;
  /** 下一次破屏前的震动已经起过了（记的是那一段的下标）；换段前的那句话已经说过了（同上） */
  private rumbled = -1;
  private said = -1;
  /** 主角还剩几滴血；这个时刻（曲子的毫秒）之前不再扣 */
  private hp = 0;
  private graceUntil = 0;
  /** 主角的替身：2D 的玩法挪的是它。真的主角藏在原地不动（挪他会揭开迷雾、换房间），打完再露出来 */
  private hero: Phaser.GameObjects.Image | null = null;
  private hitsound: Hitsound | null = null;
  /** 键盘上刚按下、还没被读走的键（KeyboardEvent.code）；上一帧按着的方向（手柄、触屏靠它认出「刚按下」） */
  private readonly tapped = new Set<string>();
  private was: MoveInput = { left: false, right: false, up: false, down: false };
  private readonly onKey = (e: KeyboardEvent): void => { if (!e.repeat) this.tapped.add(e.code); };

  constructor(private readonly d: RhythmFightDeps) {}

  /** 开场白说完了（他在变钢琴）或者正在打：按键归节奏关卡，人不归玩家管 */
  get active(): boolean { return (this.phase === 'intro' && !this.talking) || this.phase === 'fill' || this.phase === 'play'; }

  /** 摆好场子：Game Master 和钢琴站到房间右边。auto = 人一能动就开打 */
  stage(chartId: string, auto: boolean): void {
    const chart = chartById(chartId), { scene, cfg } = this.d;
    if (!chart || this.phase !== 'off') return;
    const cam = scene.cameras.main, at = this.d.standAt();
    this.chart = chart; this.autoStart = auto; this.phase = 'staged';
    this.room = { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height };
    this.ground = this.d.groundBelow(at.x, at.y);
    this.piano = new PianoBoss(scene, this.room, this.ground, cfg.tile, FIGHT_DEPTH);
  }

  /** 开一场：场子还没摆就先摆；已经在说话 / 在打就不管。test = 试玩：正在打就先收掉，然后跳过开场直接从那一刻开打 */
  start(chartId: string, test?: RhythmTest): void {
    if (test) {
      if (this.phase === 'off') this.stage(chartId, false);
      if (this.phase === 'intro') return;   // 开场白说到一半：不打断
      this.pending = test;
      this.stop();
      return;
    }
    if (this.phase === 'off') this.stage(chartId, true);
    else if (this.phase === 'staged') this.autoStart = true;
  }

  /** 中途退出 */
  stop(): void {
    if (this.phase === 'play') this.stopping = true;
    else if (this.phase === 'lure' || this.phase === 'fill') {   // 还在放板 / 填血条：收掉，不打了
      if (this.phase === 'fill') { this.d.onBoss(null); this.d.onEnd(); this.d.player().unfreeze(); }
      this.lure?.destroy(); this.lure = null; this.fill?.sound.close(); this.fill = null; this.phase = 'staged'; this.autoStart = false;
    }
  }

  /** 每帧 */
  update(): void {
    const cfg = this.d.cfg.world3d.rhythm;
    if (this.phase === 'off') return;
    if (this.phase === 'staged' && this.pending && !this.d.away() && this.d.canStart()) {
      // 试玩：不说开场白、不放板、不填血条，钢琴变出来就从那一刻开打
      const test = this.pending;
      this.pending = null; this.phase = 'intro';
      this.piano?.summon(() => { if (this.phase === 'intro') this.play(null, test); });
      return;
    }
    if (this.phase === 'staged' && this.autoStart && this.d.canStart()) { this.intro(); return; }
    if (this.phase === 'lure') {
      this.piano?.update(0, null, cfg);
      const on = this.lure!.update();
      if (on) this.lock(on);   // 跳上去的那一瞬间：锁定
      return;
    }
    if (this.phase === 'fill') {   // 一步一步来：先只填血条（板还摆着、人站着），填满了才有后面的演出
      this.piano?.update(0, null, cfg);
      this.lure?.update();
      this.fillBar();
      return;
    }
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
      if (this.modes.has(section)) this.piano?.throwProp();   // 2D 的玩法：道具是他甩手扔过来的
      if (realm(section) === 'deep' && !away) this.d.onBreak();   // 破屏的那一刻
    }
    const next = section + 1;
    // 下一段开始之前 Game Master 有话说：这一段快结束时开始说，说到下一段开头空着的那一小节
    const line = s.chart.sections[next]?.say, beat = beatMs(s.chart);
    if (line && this.said !== next && sectionStarts(s.chart)[next] - now < SAY.leadBeats * beat) {
      this.said = next;
      this.piano?.setTalking(true);
      this.d.say(line, (SAY.leadBeats + SAY.tailBeats) * beat, () => this.piano?.setTalking(false));
    }
    // 快要破屏了：画面先震起来
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

  /** Game Master 在操控画面：每拍放大一下再收回去，左右慢慢晃（两小节一个来回） */
  private sway(now: number): void {
    const s = this.session!, cfg = this.d.cfg.world3d.rhythm.sway, cam = this.d.scene.cameras.main;
    const beats = (now - s.chart.offsetMs) / beatMs(s.chart), phase = ((beats % 1) + 1) % 1;
    cam.setZoom(1 + (beats >= 0 ? cfg.zoom * Math.exp(-phase * 5) : 0));
    cam.setRotation(Phaser.Math.DegToRad(cfg.rollDeg) * Math.sin(beats / 8 * Math.PI * 2));
  }

  /** 场景关闭（换层、重开、关掉游戏）时调：东西收干净；人不用还原（他也要跟着场景没了，物理体可能已经拆掉） */
  destroy(): void {
    if (this.session) endRhythm();
    this.clearFight(false);
    this.lure?.destroy(); this.lure = null;
    this.piano?.destroy(); this.piano = null;
    this.phase = 'off';
  }

  /** Game Master 说开场白（玩家跳一下翻一句，人照常能跳），说完安静一会，他把钢琴变出来，开打 */
  private intro(): void {
    this.phase = 'intro'; this.talking = true;
    const p = this.d.player();
    p.setVelocityX(0); p.setFlipX(false);   // 站住，脸朝着他
    this.piano?.setTalking(true);
    this.d.talk(() => { this.talking = false; }, () => {
      this.piano?.setTalking(false);
      this.d.scene.time.delayedCall(QUIET_MS, () => {
        if (this.phase === 'intro') this.piano?.summon(() => { if (this.phase === 'intro') this.bait(); });
      });
    });
  }

  /** 引子：把人还给玩家，Game Master 弹一下放一块板，排在主角前面 */
  private bait(): void {
    const { scene, cfg } = this.d, p = this.d.player(), piano = this.piano!;
    this.phase = 'lure';
    this.lure = new Lure({
      scene, player: p, tile: cfg.tile, ground: this.ground, depth: FIGHT_DEPTH, startX: p.x + PILLAR.gap * cfg.tile, from: () => piano.hand,
      onThrow: i => piano.tap(0.2 + 0.2 * i),
    });
  }

  /** 开打。on = 主角踩着的那块板：正中的 x，左边、右边各有几块落好了（null = 没有引子，人在哪就在哪开）；test = 试玩 */
  private play(on: { x: number; left: number; right: number } | null, test: RhythmTest | null = null): void {
    const chart = this.chart!, { scene, cfg } = this.d, room = this.room;
    this.test = test;
    const session = beginRhythm(chart, import.meta.env.BASE_URL + chart.audio, Math.min(1, cfg.musicVolume * cfg.world3d.rhythm.musicGain), test?.fromMs ?? 0);   // 这首曲子比平时的背景音乐响
    if (!session) { this.phase = 'staged'; this.autoStart = false; this.d.onBoss(null); this.d.onEnd(); this.d.player().unfreeze(); return; }
    this.bossFull = null;
    this.session = session; this.section = -1; this.stopping = false; this.rumbled = -1; this.said = -1; this.phase = 'play';
    this.hp = cfg.world3d.rhythm.heroHp; this.graceUntil = 0;
    this.backdrop = scene.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, Colors.ink, DIM).setDepth(FIGHT_DEPTH - 2);

    const p = this.d.player(), piano = this.piano!;
    p.freeze(0xffffff); p.clearTint(); p.setVisible(false);
    const hero = this.hero = scene.add.image(p.x, p.y, p.texture.key).setDisplaySize(p.displayWidth, p.displayHeight).setFlipX(false).setDepth(FIGHT_DEPTH + 2);
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
        scene, room, ground: this.ground, heroX: on?.x ?? p.x, built: on && { left: on.left, right: on.right }, source: { x: piano.rect.x, y: piano.rect.y }, boss: piano.hand, tile: cfg.tile, depth: FIGHT_DEPTH, hero, score: session.score,
        travelMs: travelMsOf(chart, s.mode, rc().travelBeats), beat: { ms: beatMs(chart), offsetMs: chart.offsetMs }, config: rc, punch, hurt: () => this.hurt(), boom: () => session.boom(), strikeBoss: (x, y, size, color) => this.strikeBoss(x, y, size, color),
      }, session.notes.filter(n => n.section === i)));
    });
    // 每次判定：当场出一声、HUD 上弹字（自动判的——躲过去的弹幕——不出声不弹字，只记分）；血条跟着分数掉
    const hitsound = this.hitsound = createHitsound(cfg.musicVolume);
    session.score.listen((j, by) => {
      if (by === 'press' && j === 'miss') hitsound.play(j);   // 按键的声音统一是起跳爆炸（各玩法自己出）；这里只剩漏掉时的那一声
      this.d.onScore({ points: session.score.points, combo: session.score.combo, judge: by === 'press' ? j : null });
      this.pushBoss();
    });
    this.d.onScore({ points: 0, combo: 0, judge: null, fresh: true });
    this.shownBossHp = -1; this.pushBoss();
    this.d.onHp({ hp: this.hp, max: this.hp });
    // 3D 那一半要用的：Game Master 在画面的哪、主角挨了一下、Game Master 挨了一下
    session.boss = { x: (piano.body.x - room.x) / room.w, y: (piano.body.y - room.y) / room.h };
    session.hurt = () => this.hurt();
    session.bossHit = () => piano.flinch();
    session.boom = () => scene.sound.play(BOOM.key, { volume: BOOM.volume });
    scene.input.keyboard?.on('keydown', this.onKey);
    if (!on) this.d.onBegin();   // 没经过填血条那一步：这一层的音乐在这让位
    session.conductor.start(test?.fromMs ?? 0);
  }

  /** 主角踩上了一块板：锁住他，这一层的音乐停下，Game Master 的血条出现（空的），开始填 */
  private lock(on: { x: number; left: number; right: number }): void {
    const { scene } = this.d, p = this.d.player();
    p.freeze(0xffffff); p.clearTint();
    this.fill = { last: scene.time.now, hp: 0, fullAt: 0, sound: createBossSound(), ...this.bossSize(this.chart!, notesOf(this.chart!)), on };
    this.phase = 'fill';
    this.d.onBegin();
    this.d.onBoss({ hp: 0, max: this.fill.max, per: this.fill.per });
  }

  /** 把 Game Master 的血条填满：一格一格涨、每格「滴」一声，越往后的管填得越快、声音越高；每满一管震一下。全满之后停一下，才开打 */
  private fillBar(): void {
    const f = this.fill!, { scene } = this.d, per = f.per, real = scene.time.now;
    if (f.hp >= f.max) {
      if (real - f.fullAt < FILL.holdMs) return;
      this.fill = null;
      f.sound.close();
      this.lure?.destroy(); this.lure = null;
      this.play(f.on);
      return;
    }
    /** 正在填第几管（0 起）时一格隔多久 */
    const cellMs = (tube: number) => Math.max(FILL.minMs, FILL.cellMs * FILL.faster ** tube);
    const before = f.hp;
    while (f.hp < f.max && real - f.last >= cellMs(Math.floor(f.hp / per))) {
      f.last += cellMs(Math.floor(f.hp / per));
      f.hp++;
      if (f.hp % per === 0 || f.hp === f.max) scene.cameras.main.shake(FILL.shake.ms, FILL.shake.strength);   // 满了一管
    }
    if (f.hp === before) return;
    this.d.onBoss({ hp: f.hp, max: f.max, per });
    const tubes = Math.ceil(f.max / per), tube = Math.floor((f.hp - 1) / per);
    f.sound.beep((f.hp - 1) % per + tube * per / 2, per + tubes * per / 2);   // 一管里音越来越高，下一管从更高的地方起
    if (f.hp >= f.max) f.fullAt = real;
  }

  /** 主角挨了一下：扣一滴血（刚挨过的一小段时间里不扣）；扣光了这一场就输了 */
  private hurt(): void {
    const s = this.session;
    if (!s || this.phase !== 'play' || this.stopping || this.test?.god) return;   // 试玩开了无敌：不掉血
    const now = s.conductor.timeMs(), cfg = this.d.cfg.world3d.rhythm;
    if (now < this.graceUntil) return;
    this.graceUntil = now + cfg.hurtGraceMs;
    this.hp = Math.max(0, this.hp - 1);
    this.d.onHp({ hp: this.hp, max: cfg.heroHp });
    this.d.scene.cameras.main.shake(140, 0.006);
    if (this.hp <= 0) this.stopping = true;
  }

  /** Game Master 的血：亲手接住一个（Perfect / Good）掉一滴；per = 一管多少滴 */
  private bossHp(): { hp: number; max: number; per: number } {
    const s = this.session!, size = this.bossFull ??= this.bossSize(s.chart, s.notes);   // 一场里不变：算一次
    return { hp: Math.max(0, size.max - s.score.struck), ...size };
  }

  /** 血条变了才告诉 HUD（躲过去的弹幕、Miss 不掉血，不用每次判定都派发） */
  private pushBoss(): void {
    const b = this.bossHp();
    if (b.hp === this.shownBossHp) return;
    this.shownBossHp = b.hp;
    this.d.onBoss(b);
  }

  /**
   * Game Master 一共多少血、一管多少滴：固定 bossTubes 管；总量是能打到他的音符（躲弹幕那一段不算；长按算两下，和成绩里一样）
   * 的六成（passRatio），一管的滴数往上取整——所以血条填满时每一管都是满的
   */
  private bossSize(chart: Chart, notes: readonly Note[]): { max: number; per: number } {
    const cfg = this.d.cfg.world3d.rhythm;
    const total = notes.reduce((n, note) => n + (RHYTHM_MODES[chart.sections[note.section].mode].hurtsBoss ? (note.holdMs ? 2 : 1) : 0), 0);
    const per = Math.max(1, Math.ceil(total * cfg.passRatio / cfg.bossTubes));
    return { max: per * cfg.bossTubes, per };
  }

  /** 接住的音符弹回去砸 Game Master：划一道弧线飞到他身上，砸到了他缩一下 */
  private strikeBoss(x: number, y: number, size: number, color: number): void {
    const { scene } = this.d, piano = this.piano;
    if (!piano) return;
    const to = piano.body, shot = scene.add.rectangle(x, y, size, size, color).setStrokeStyle(2, Colors.ink).setDepth(FIGHT_DEPTH + 3);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: RETURN.ms, ease: 'Sine.easeIn',
      onUpdate: tw => {
        const k = tw.getValue() ?? 0;
        shot.setPosition(Phaser.Math.Linear(x, to.x, k), Phaser.Math.Linear(y, to.y, k) - Math.sin(Math.PI * k) * RETURN.arc * this.d.cfg.tile).setAngle(k * RETURN.spin);
      },
      onComplete: () => { shot.destroy(); if (this.phase === 'play') piano.flinch(); },
    });
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
    const won = !this.stopping && this.hp > 0 && this.bossHp().hp <= 0, percent = Math.round(s.score.ratio * 100);
    endRhythm(cfg.fadeOutMs);   // 曲子慢慢小下去，不是戛然而止
    this.clearFight();
    this.phase = 'staged'; this.autoStart = false;   // Game Master 还站在那：再开一场就再打一遍
    this.d.onScore(null);
    this.d.onBoss(null);
    this.d.onHp(null);
    this.d.onEnd();
    if (!this.pending) this.d.onResult(won, percent, this.test !== null);   // 马上要从别处重开的试玩：不弹结果
    this.test = null;
    bridge.emit(EVT.rhythmEnd, { won });
  }

  /** 收掉一场里的东西（Game Master 和钢琴留着） */
  /** restorePlayer：把藏起来、冻住的人还原（场景关闭时不用，也不能：物理体可能已经拆掉了） */
  private clearFight(restorePlayer = true): void {
    this.d.scene.input.keyboard?.off('keydown', this.onKey);
    this.modes.forEach(m => m.destroy()); this.modes.clear();
    this.backdrop?.destroy(); this.backdrop = null;
    this.d.scene.cameras.main?.setZoom(1).setRotation(0);   // 场景关闭时镜头已经没了
    if (this.hero) this.d.scene.tweens.killTweensOf(this.hero);
    this.piano?.reset();
    this.hero?.destroy(); this.hero = null;
    this.hitsound?.close(); this.hitsound = null;
    this.talking = false; this.fill?.sound.close(); this.fill = null;
    const wasPlaying = this.session !== null;
    this.session = null; this.tapped.clear();
    if (restorePlayer && (wasPlaying || this.phase === 'intro' || this.phase === 'fill')) { const p = this.d.player(); p.setVisible(true); p.unfreeze(); }
  }
}
