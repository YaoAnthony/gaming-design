// ===== 通用机制：解开节点 =====
// 这一层在 nodes.ts 里有节点就启用。每帧看还没触发的节点：条件成立了就告诉场景「这个房间解开了」（ctx.solves.solve），
// 场景等房间安静下来，把它现在的样子记成复原点、写进存档（core/Solves.ts）。
import type { PlayContext } from '@/game/core/PlayContext';
import type { RoomCoord } from '@/type';
import { defineMechanic, type Mechanic } from '../define';
import type { Locks } from '../locks/Locks';
import type { BossFight } from '../boss/BossFight';
import type { Movers } from '../mover/Movers';
import { SOLVE_NODES, type SolveNode } from './nodes';

export class SolveNodes implements Mechanic {
  /** 还没触发的节点和它的房间 */
  private left: { node: SolveNode; r: RoomCoord }[] = [];

  constructor(private readonly ctx: PlayContext) {}

  start(): void {
    this.left = (SOLVE_NODES[this.ctx.floor.id] ?? []).flatMap(node => {
      const r = this.ctx.rooms.find(node.room);
      return r && !this.ctx.solves.has(node.id) ? [{ node, r }] : [];
    });
  }

  update(): void {
    if (!this.left.length) return;
    this.left = this.left.filter(({ node, r }) => {
      if (!this.met(node, r)) return true;
      this.ctx.solves.solve(r, node.id);
      return false;
    });
  }

  /** 只由成功拾取调用；拿着、读档、放下重捡都不会重复触发同一节点。 */
  onKeyPicked(group: number, at: RoomCoord): void {
    this.left = this.left.filter(({ node, r }) => {
      if (node.when.kind !== 'key' || node.when.group !== group || !this.ctx.rooms.same(r, at)) return true;
      this.ctx.solves.solve(r, node.id);
      this.ctx.saveCheckpoint();
      return false;
    });
  }

  private met(node: SolveNode, r: RoomCoord): boolean {
    const w = node.when;
    if (w.kind === 'key') return false;   // 钥匙只响应拾取事件，不逐帧看持有状态
    if (w.kind === 'door') return !!this.ctx.mech<Locks>('locks')?.openedIn(r, w.group);
    if (w.kind === 'boss') return !!this.ctx.mech<BossFight>('boss')?.isDefeated(r);
    return !!this.ctx.mech<Movers>('mover')?.startedIn(r);
  }
}

defineMechanic({
  id: 'solve', name: '解开节点', desc: '某个房间里发生了某件事（开门、打赢 Boss、移动方块动起来），这个房间就算解开，之后重置回到解开时的样子',
  scope: 'global',
  activeOn: floor => !!SOLVE_NODES[floor.id]?.length,
  create: ctx => new SolveNodes(ctx),
});
