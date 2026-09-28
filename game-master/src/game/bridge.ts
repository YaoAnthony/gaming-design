// ===== React ↔ Phaser 桥接 =====
// React → Phaser：通过这个事件总线（编辑器重载、开始游戏）
// Phaser → React：直接 dispatch 到 Redux（hud / save slice）
import Phaser from 'phaser';
import type { Project, RoomCoord } from '@/type';

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
  /** 长大阶段（0 = 1 格高，1 = 1.5 格，2 = 2 格；假通关「进入下一关」每次长一阶；换层时带过去） */
  stage?: number;
  playtest?: boolean;
  /** 这一局最开始的启动数据（换层时一路带着）：「再来一次」从这里重开 */
  origin?: StartGameData;
}

/** 第四面墙特效（攥纸团）开始：手攥住的位置（画面上的比例坐标 0..1） */
export interface CrumpleStart { grab: { x: number; y: number } }
/** 游戏冻住了：冻住那一帧的画面（从游戏画布复制出来的一张画布） */
export interface CrumpleFrozen { image: HTMLCanvasElement }
/** 特效放完：接下来遮罩淡出、新画面淡入要多久（毫秒）。人等淡入完再由骷髅手放进来 */
export interface CrumpleDone { fadeMs: number }

/** 编辑器地图上点的一格：key 是房间，x/y 是房间里的格子，wx/wy 是整层地图上的格子 */
export interface PickedCell { key: string; x: number; y: number; wx: number; wy: number }

export const SCENE = { boot: 'Boot', game: 'Game', editor: 'Editor' } as const;

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
  /** 假通关弹窗「进入下一关」：地图复原、回出生点、长成 2 格高再玩一次 */
  nextLevel: 'game:next',
  /** Phaser → React：放攥纸团特效（游戏照常跑，手先伸进来）；参数是 CrumpleStart */
  crumple: 'fx:crumple',
  /** React → Phaser：手碰到画面了，冻住游戏、复制这一帧 */
  crumpleFreeze: 'fx:crumple-freeze',
  /** Phaser → React：冻住了；参数是 CrumpleFrozen */
  crumpleFrozen: 'fx:crumple-frozen',
  /** React → Phaser：纸团扔掉了，做攥之前说好的事（比如重置房间）、接着玩；参数是 CrumpleDone */
  crumpleDone: 'fx:crumple-done',
} as const;

export const bridge = new Phaser.Events.EventEmitter();
