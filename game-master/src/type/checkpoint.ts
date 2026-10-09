import type { EntryState, CarryOver, FogState } from './save';
import type { WorldModel } from './world';
import type { RunStats } from './run';

export interface ChunkCheckpoint {
  cells: { x: number; y: number; id: string; from?: number }[];
  vy: number; py: number; floatSpeed: number; t: number;
}
export interface CellTimer<T> { cells: T[]; ms: number }
export interface TerrainCheckpoint {
  rows: string[]; origin: number[]; chunks: ChunkCheckpoint[];
  pending: CellTimer<{ x: number; y: number; id: string }>[];
}
export interface FuseCheckpoint {
  rows: string[]; locked: number[];
  pending: CellTimer<{ x: number; y: number; ch: number }>[];
}
export interface LooseCheckpoint {
  x: number; y: number; vx: number; vy: number;
  home: { x: number; y: number }; onGround: boolean;
}
export interface EnemyCheckpoint {
  spawn: { x: number; y: number; rx: number; ry: number };
  x: number; y: number; vx: number; vy: number; scale: number;
  dir: 1 | -1; awake: boolean; biting: boolean; biteFrame: number;
  mode: 'patrol' | 'alert' | 'chase'; alertMs: number; seenAgo: number;
  lastSeenX: number; lookMs: number; biteMs: number; slipping: -1 | 0 | 1;
}
export interface PaperCheckpoint {
  chunk: ChunkCheckpoint; carrier: number | 'player'; offsetX: number;
}
/** 一次 checkpoint 的全图状态；只包含 JSON 数据，不包含 Phaser 对象。 */
export interface WorldCheckpoint {
  version: 1; floorId: string; mapKey: string; tile: number;
  /** entry 只用于继续游戏；checkpoint 才接管死亡时的全图恢复。 */
  kind: 'entry' | 'checkpoint';
  entry: EntryState; stage: number; carry: CarryOver; stats: RunStats;
  flags: Record<string, true>;
  terrain: TerrainCheckpoint; fuse: FuseCheckpoint;
  mechs: Record<string, unknown>; enemies: EnemyCheckpoint[]; paper: PaperCheckpoint[];
  awake: string[]; nodes: string[]; fog: FogState | null;
}

/** 包括物件、门、引线和布局，编辑地图后不会套用旧快照。 */
export function checkpointMapKey(model: WorldModel): string {
  const text = JSON.stringify(model);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
