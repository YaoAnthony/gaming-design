// ===== React ↔ Phaser 桥接 =====
// React → Phaser：通过这个事件总线（编辑器重载、开始游戏）
// Phaser → React：直接 dispatch 到 Redux（hud / save slice）
import Phaser from 'phaser';
import type { FogState, RoomCoord, WorldModel } from '@/type';

export interface StartGameData {
  model: WorldModel;
  /** 读档时整张地图的格子状态 */
  rows?: string[];
  startRoom?: RoomCoord | null;
  entry?: { x: number; y: number; vx: number; vy: number } | null;
  stats?: { jumps: number; destroyed: number } | null;
  fog?: FogState | null;
  fuse?: string[] | null;
  playtest?: boolean;
}

export const SCENE = { boot: 'Boot', game: 'Game', editor: 'Editor' } as const;

export const EVT = {
  editorReload: 'editor:reload',
  startGame: 'game:start',
  playtestExit: 'playtest:exit',
} as const;

export const bridge = new Phaser.Events.EventEmitter();
