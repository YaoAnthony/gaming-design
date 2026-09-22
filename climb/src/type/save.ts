// ===== 存档 =====
import type { RoomCoord } from './tile';

export interface SaveStats { jumps: number; destroyed: number }

export interface EntryState { x: number; y: number; vx: number; vy: number }

export interface SaveData {
  version: 1;
  /** 存档时整张地图的格子状态（含被炸掉 / 掉落后的样子） */
  rows: string[];
  room: RoomCoord;
  entry: EntryState;
  stats: SaveStats;
  savedAt: number;
}
