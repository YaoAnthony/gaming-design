// ===== 存档 =====
import type { RoomCoord } from './tile';

export interface SaveStats { jumps: number; destroyed: number }

export interface EntryState { x: number; y: number; vx: number; vy: number }

/** 迷雾的探索记忆：见过的格子 + 已揭开的迷雾区 */
export interface FogState {
  /** 每行一串 '0'/'1'，和整张地图同尺寸 */
  explored: string[];
  /** "房间key:区号" */
  revealedZones: string[];
}

export interface SaveData {
  version: 1;
  /** 在第几层（层 id） */
  floorId?: string;
  /** 身上带着的道具 id */
  items?: string[];
  fog?: FogState;
  /** 引线层的当前状态（烧掉的不会回来），每行 '0'/'1' */
  fuse?: string[];
  /** 存档时整张地图的格子状态（含被炸掉 / 掉落后的样子） */
  rows: string[];
  room: RoomCoord;
  entry: EntryState;
  stats: SaveStats;
  savedAt: number;
}
