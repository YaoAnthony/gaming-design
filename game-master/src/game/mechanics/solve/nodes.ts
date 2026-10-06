// ===== 解开节点：哪里发生了什么，那个房间就算解开了（之后死了 / R 回到解开时的样子，见 core/Solves.ts）=====
// 层 id → 这一层的节点。加一个节点就是加一行：id 不能重复（存档里按 id 记触发过没有），room 是房间 key（地图布局里的字母）。
// 门的颜色组是地图 locks.groups 里的 id。

/** 什么时候算解开 */
export type SolveWhen =
  /** 这个房间里这一组（颜色）的门被钥匙打开 */
  | { kind: 'door'; group: number }
  /** 这个房间的 Boss 被打败 */
  | { kind: 'boss' }
  /** 这个房间里的移动方块第一次动起来 */
  | { kind: 'mover' };

export interface SolveNode { id: string; room: string; when: SolveWhen }

export const SOLVE_NODES: Record<string, SolveNode[]> = {
  // Floor 1（Dungeon）。门的组：1 = 蓝，2 = 绿，3 = 黄，4 = 红
  f2: [
    { id: 'f2.C.mover', room: 'C', when: { kind: 'mover' } },
    { id: 'f2.A.blue', room: 'A', when: { kind: 'door', group: 1 } },
    { id: 'f2.D.yellow', room: 'D', when: { kind: 'door', group: 3 } },
    { id: 'f2.F.boss', room: 'F', when: { kind: 'boss' } },
    { id: 'f2.I.red', room: 'I', when: { kind: 'door', group: 4 } },
    { id: 'f2.M.blue', room: 'M', when: { kind: 'door', group: 1 } },
  ],
};
