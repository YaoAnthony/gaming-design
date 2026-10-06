// ===== 钥匙门的连锁（纯函数，单测直接调） =====
import type { CellRef } from '@/type';
import type { LockCell } from '@/game/mechanics/locks/model';

/** 连锁里的一扇门：hop = 从碰到的那扇门开始传了几格 */
export interface DoorHop extends LockCell { hop: number }

/** 一把钥匙碰得到门的范围（像素） */
export interface KeyArea { x: number; y: number; width: number; height: number }

/**
 * 这把钥匙碰到的门：范围往外 touchPx 像素以内、同一组、还锁着的门里，离范围中心最近的那扇；没碰到返回 null。
 * 同时擦到好几扇（比如跨两行）从最近的那扇开始传，连锁看起来是从碰的地方散开的
 * @param locked 这一格现在还是锁着的门吗（开过的、被炸掉的不算）
 */
export function touchedDoor(doors: LockCell[], group: number, area: KeyArea, tile: number, touchPx: number, locked: (c: LockCell) => boolean): LockCell | null {
  const x0 = Math.floor((area.x - touchPx) / tile), x1 = Math.floor((area.x + area.width + touchPx) / tile);
  const y0 = Math.floor((area.y - touchPx) / tile), y1 = Math.floor((area.y + area.height + touchPx) / tile);
  const cx = (area.x + area.width / 2) / tile - 0.5, cy = (area.y + area.height / 2) / tile - 0.5;
  let best: LockCell | null = null, bestDist = Infinity;
  for (const c of doors) {
    if (c.group !== group || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1 || !locked(c)) continue;
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

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
