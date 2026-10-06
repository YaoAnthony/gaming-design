// ===== 事件表：总线上有哪些事件、每个事件带什么参数 =====
// React → Phaser：编辑器重载、重置、试玩退出、攥纸团特效的往返。
// Phaser → React：展示数据 dispatch 到 Redux 的 hud 切片（只在场景和 core 里做，机制通过 PlayContext），不走这里。
// 事件名在 EVT，参数在 BridgeEvents。
import type { Project, RoomCoord } from '@/type';
import type { HeroEntryQuery, HeroHandoff, ScreenSpot } from './handoff';

export interface StartGameData {
  /** 整个项目（多层）；游戏从 floorId 那层开始，缺省第一层 */
  project: Project;
  floorId?: string;
  /** 进场时闪一下层名（换层用） */
  announceFloor?: boolean;
  startRoom?: RoomCoord | null;
  entry?: { x: number; y: number; vx: number; vy: number } | null;
  stats?: { jumps: number; destroyed: number } | null;
  /** 手里拿着的东西（换层时带过去；钥匙不带） */
  held?: string;
  /** 头上戴着帽子（换层时带过去） */
  hat?: boolean;
  /** 长大阶段（0 = 1 格高，1 = 1.5 格，2 = 2 格；换层时带过去） */
  stage?: number;
  playtest?: boolean;
  /** 技术验证编辑器里的试玩：到了节奏关卡的场地不自动开打，等 EVT.rhythmStart 带着 test 来 */
  rhythmLab?: boolean;
  /** 这一局最开始的启动数据（换层时一路带着）：「再来一次」从这里重开 */
  origin?: StartGameData;
}

/** 第四面墙特效（攥纸团）开始：手攥住的位置（画面上的比例坐标 0..1） */
export interface CrumpleStart { grab: { x: number; y: number } }
/** 特效放完：接下来遮罩淡出、新画面淡入要多久（毫秒）。人等淡入完再由骷髅手放进来 */
export interface CrumpleDone { fadeMs: number }

/** 3D 舞台上的特效（实现在 stage3d/fx，按这里的 id 注册） */
export const STAGE_FX = {
  /** 整个画面往后倒，游戏接着玩 */
  tilt: 'tilt',
  /** 屏幕变成一张纸，被攥成团（由 ui/crumple 的时间线带着走，不能单发事件放） */
  crumple: 'crumple',
  /** 3D 世界：主角跳出画面之后的关卡（由 EVT.heroLeft 带起来，不能单发事件放） */
  world: 'world',
} as const;
export type StageFxId = typeof STAGE_FX[keyof typeof STAGE_FX];
export interface StageFxRef { id: StageFxId }

/** 试玩节奏关卡（技术验证编辑器用）：从曲子的第几毫秒开始；god = 主角不掉血。不说开场白、不放板、不填血条，直接开打，打完不算通关 */
export interface RhythmTest { fromMs: number; god: boolean }
/** 开一场节奏关卡：用哪张谱（rhythm/charts 里的 id）；test = 试玩（正在打就先收掉再从那开始） */
export interface RhythmStart { chartId: string; test?: RhythmTest }
/** 节奏关卡结束：过没过关 */
export interface RhythmEnd { won: boolean }

/** 编辑器地图上点的一格：key 是房间，x/y 是房间里的格子，wx/wy 是整层地图上的格子 */
export interface PickedCell { key: string; x: number; y: number; wx: number; wy: number }

export const EVT = {
  editorReload: 'editor:reload',
  startGame: 'game:start',
  playtestExit: 'playtest:exit',
  /** 编辑器的「返回编辑器」按钮：试玩中请求退出（和 ESC 一样） */
  requestPlaytestExit: 'playtest:request-exit',
  /** 选试玩起点时在编辑器地图上点了一格：参数是 PickedCell */
  editorPickStart: 'editor:pick-start',
  requestReset: 'game:reset',
  /** 通关弹窗关掉：继续玩 */
  continueGame: 'game:continue',
  /** 通关弹窗「再来一次」：从这一局的起点重开 */
  restartGame: 'game:restart',
  /** 假通关弹窗「进入下一关」：去这个项目里的下一层（GameScene.fakeNextLevel） */
  nextLevel: 'game:next',
  /** Phaser → React：放攥纸团特效（游戏照常跑，手先伸进来）；参数是 CrumpleStart */
  crumple: 'fx:crumple',
  /** React → Phaser：手碰到画面了，冻住游戏、复制这一帧 */
  crumpleFreeze: 'fx:crumple-freeze',
  /** Phaser → React：冻住了，冻住的那一帧已经画出来 */
  crumpleFrozen: 'fx:crumple-frozen',
  /** React → Phaser：纸团扔掉了，做攥之前说好的事（比如重置房间）、接着玩；参数是 CrumpleDone */
  crumpleDone: 'fx:crumple-done',
  /** → 舞台：放一个特效；参数是 StageFxRef。已经在放、或这个特效不能单发事件放，直接回 stageFxDone */
  stageFx: 'stage:fx',
  /** → 舞台：请这个特效收场（比如倒下去的画面扶起来）；参数是 StageFxRef */
  stageFxEnd: 'stage:fx-end',
  /** 舞台 →：这个特效放完、撤掉了；参数是 StageFxRef */
  stageFxDone: 'stage:fx-done',
  /** → Phaser：开一场节奏关卡（Game Master 在画面里弹琴，主角跟着曲子玩，每段换一种玩法）；参数是 RhythmStart */
  rhythmStart: 'rhythm:start',
  /** → Phaser：正在进行的节奏关卡中途退出 */
  rhythmStop: 'rhythm:stop',
  /** Phaser →：节奏关卡结束了；参数是 RhythmEnd */
  rhythmEnd: 'rhythm:end',
  /** → Phaser：让主角从画面里跳出来（人归玩家管的时候才跳；没挂 3D 舞台就不跳） */
  heroPopOut: 'hero:pop-out',
  /** Phaser → 3D：人已经藏起来了，交给你；参数是 HeroHandoff */
  heroLeft: 'hero:left',
  /** 3D → Phaser：人要从画面的这个位置走回去，实际能落在哪；参数是 HeroEntryQuery（当场填 answer） */
  heroEntry: 'hero:entry',
  /** 3D → Phaser：人走回画面了，放出来接着玩；参数是落在哪（HeroEntryQuery 的 answer），null = 原地 */
  heroReturn: 'hero:return',
} as const;

/** 每个事件带什么参数（元组）：没有参数就是 [] */
export interface BridgeEvents {
  [EVT.editorReload]: [];
  [EVT.startGame]: [StartGameData];
  [EVT.playtestExit]: [];
  [EVT.requestPlaytestExit]: [];
  [EVT.editorPickStart]: [PickedCell];
  [EVT.requestReset]: [];
  [EVT.continueGame]: [];
  [EVT.restartGame]: [];
  [EVT.nextLevel]: [];
  [EVT.crumple]: [CrumpleStart];
  [EVT.crumpleFreeze]: [];
  [EVT.crumpleFrozen]: [];
  [EVT.crumpleDone]: [CrumpleDone];
  [EVT.stageFx]: [StageFxRef];
  [EVT.stageFxEnd]: [StageFxRef];
  [EVT.stageFxDone]: [StageFxRef];
  [EVT.rhythmStart]: [RhythmStart];
  [EVT.rhythmStop]: [];
  [EVT.rhythmEnd]: [RhythmEnd];
  [EVT.heroPopOut]: [];
  [EVT.heroLeft]: [HeroHandoff];
  [EVT.heroEntry]: [HeroEntryQuery];
  [EVT.heroReturn]: [ScreenSpot | null];
  /** 触屏按键（常量在 input.ts，字面量要和那边一致） */
  'input:jump': [];
  'input:action': [];
}
export type BridgeEvent = keyof BridgeEvents;
