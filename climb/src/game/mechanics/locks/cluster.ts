// ===== 钥匙门的连锁（纯函数，单测直接调） =====
import type { CellRef } from '@/type';
import type { LockCell } from '@/game/world/WorldModel';

/** 连锁里的一扇门：hop = 从碰到的那扇门开始传了几格 */
export interface DoorHop extends LockCell { hop: number }

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 从 start 这扇门出发，沿上下左右相邻、同一组（同色）、还锁着的门往外传，返回连在一起的这一片门和每扇门的跳数。
 * 不同色的门、隔开的同色门都不算：它们是另一片，要另一把钥匙
 * @param locked 这一格现在还是锁着的门吗（开过的、被炸掉的不算）
 */
export function doorCluster(doors: LockCell[], start: CellRef, locked: (c: LockCell) => boolean): DoorHop[] {
  const at = new Map<string, LockCell>();
  doors.forEach(d => at.set(`${d.x},${d.y}`, d));
  const first = at.get(`${start.x},${start.y}`);
  if (!first || !locked(first)) return [];
  const out: DoorHop[] = [{ ...first, hop: 0 }];
  const seen = new Set([`${first.x},${first.y}`]);
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    for (const [dx, dy] of NEIGHBORS) {
      const k = `${c.x + dx},${c.y + dy}`, n = at.get(k);
      if (!n || seen.has(k) || n.group !== first.group || !locked(n)) continue;
      seen.add(k);
      out.push({ ...n, hop: c.hop + 1 });
    }
  }
  return out;
}
