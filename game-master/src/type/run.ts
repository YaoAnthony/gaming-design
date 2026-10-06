// ===== 玩家的进度（存档）：2D 游戏和 3D 世界共用的一份，在 Redux 的 run 切片里，由 redux/persist.ts 落盘 =====
// 只在检查点写（进层、换房间、跳出 / 回到画面）；每帧在变的东西（位置、速度）不放这里。
// 读档 = 回到检查点：那一层按初始状态重建，人出现在检查点的房间里，炸掉的地形不记。
import type { RoomCoord } from './tile';
import type { CarryOver } from './save';

/** 存档结构的版本：结构变了就加一，并在 redux/persist.ts 的 readRun 里接住旧版本（1 → 2：帽子、手上的道具并进 carry） */
export const RUN_VERSION = 2;

/** 人现在在哪个世界：flat = 画面里的 2D 游戏，deep = 跳出画面之后的 3D 世界 */
export type Realm = 'flat' | 'deep';

export interface RunStats { jumps: number; destroyed: number }

export interface RunState {
  version: typeof RUN_VERSION;
  /** 有一局正在进行（标题页显示「继续」） */
  active: boolean;
  realm: Realm;
  /** 2D：在哪一层、哪个房间（null = 那一层的出生点） */
  floorId: string | null;
  room: RoomCoord | null;
  /** 长大阶段 */
  stage: number;
  /** 各机制要带着走的东西（手上的道具、帽子……）：机制 id → 那个机制自己的数据，见 type/save.ts 的 CarryOver */
  carry: CarryOver;
  stats: RunStats;
  /** 已经发生过的事（打破第四面墙的桥段只演一次之类）：事件名 → true */
  flags: Record<string, true>;
  /** 3D：在哪一关（realm 是 deep 时才有意义） */
  deep: { levelId: string } | null;
}

/** 一个检查点能改的东西 */
export type RunCheckpoint = Partial<Pick<RunState, 'floorId' | 'room' | 'stage' | 'carry' | 'stats'>>;
