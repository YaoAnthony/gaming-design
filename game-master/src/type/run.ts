// ===== 玩家的进度（存档）：2D 游戏和 3D 世界共用的一份，在 Redux 的 run 切片里，由 redux/persist.ts 落盘 =====
// 正式节点触发前保存当前房间入口；触发后普通换房间不覆盖 checkpoint。
// 继续游戏还原 world；死亡仅在正式 checkpoint 后还原 world，否则按原规则回到房间入口。
import type { RoomCoord } from './tile';
import type { CarryOver } from './save';
import type { WorldCheckpoint } from './checkpoint';

/** 存档结构的版本：结构变了就加一，并在 redux/persist.ts 的 readRun 里接住旧版本（1 → 2：随身物品并进 carry；2 → 3：增加全图快照） */
export const RUN_VERSION = 3;

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
  /** 解开过的房间和触发过的解开节点：层 id → 那一层的。读档时这些房间换成解开时的样子 */
  solved: Record<string, SolvedFloor>;
  /** 当前层最近一次完整 checkpoint；旧档没有全图状态时为 null。 */
  world: WorldCheckpoint | null;
}

/** 一层里解开过的东西 */
export interface SolvedFloor {
  /** 房间 key → 解开时（最后一次）的样子 */
  rooms: Record<string, SolvedRoom>;
  /** 触发过的解开节点 id（mechanics/solve/nodes.ts） */
  nodes: string[];
}

/** 一个解开的房间：地形（字符画）、引线（每格一位十六进制）、各机制自己记的东西（Mechanic.solvedState，机制 id → 数据） */
export interface SolvedRoom { terrain: string[]; fuse: string[]; mechs: Record<string, unknown> }

/** 一个检查点能改的东西 */
export type RunCheckpoint = Partial<Pick<RunState, 'floorId' | 'room' | 'stage' | 'carry' | 'stats' | 'world' | 'flags'>>;
