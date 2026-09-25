// ===== React ↔ Phaser 桥接 =====
// React → Phaser：通过这个事件总线（编辑器重载、开始游戏）
// Phaser → React：直接 dispatch 到 Redux（hud / save slice）
import Phaser from 'phaser';
import type { FogState, Project, RoomCoord } from '@/type';

export interface StartGameData {
  /** 整个项目（多层）；游戏从 floorId 那层开始，缺省第一层 */
  project: Project;
  floorId?: string;
  /** 进场时闪一下层名（换层用） */
  announceFloor?: boolean;
  /** 读档时整张地图的格子状态 */
  rows?: string[];
  startRoom?: RoomCoord | null;
  entry?: { x: number; y: number; vx: number; vy: number } | null;
  stats?: { jumps: number; destroyed: number } | null;
  /** 手里拿着的东西（换层时带过去；钥匙不带） */
  held?: string;
  fog?: FogState | null;
  fuse?: string[] | null;
  playtest?: boolean;
  /** 这一局最开始的启动数据（换层时一路带着）：「再来一次」从这里重开 */
  origin?: StartGameData;
}

export const SCENE = { boot: 'Boot', game: 'Game', editor: 'Editor' } as const;

export const EVT = {
  editorReload: 'editor:reload',
  startGame: 'game:start',
  playtestExit: 'playtest:exit',
  requestReset: 'game:reset',
  /** 通关弹窗关掉：继续玩 */
  continueGame: 'game:continue',
  /** 通关弹窗「再来一次」：从这一局的起点重开 */
  restartGame: 'game:restart',
} as const;

export const bridge = new Phaser.Events.EventEmitter();
