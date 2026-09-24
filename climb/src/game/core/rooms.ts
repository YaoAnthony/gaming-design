// ===== 房间里的查询（纯函数，只看地形） =====
import type { CellRef, Point, RoomCoord } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';

/** 在房间里找一个"脚下是实心、头顶两格是空气"的位置：离房间入口（边上的缺口）最近的那个，没有缺口就离中心最近；找不到就房间中央 */
export function standingSpot(terrain: Terrain, r: RoomCoord, roomW: number, roomH: number): Point {
  const T = terrain.T, x0 = r.rx * roomW, y0 = r.ry * roomH;
  const cx = x0 + roomW / 2, cy = y0 + roomH / 2;
  const openings: CellRef[] = [];
  for (let y = y0 + 1; y < y0 + roomH - 1; y++) for (const x of [x0, x0 + roomW - 1]) if (!terrain.isSolid(x, y)) openings.push({ x, y });
  for (let x = x0 + 1; x < x0 + roomW - 1; x++) for (const y of [y0, y0 + roomH - 1]) if (!terrain.isSolid(x, y)) openings.push({ x, y });
  const anchors = openings.length ? openings : [{ x: cx, y: cy }];
  let best: CellRef | null = null, bestD = Infinity;
  for (let y = y0 + 1; y < y0 + roomH - 1; y++)
    for (let x = x0 + 1; x < x0 + roomW - 1; x++) {
      if (terrain.isSolid(x, y) || terrain.isSolid(x, y - 1) || !terrain.isSolid(x, y + 1)) continue;
      if (terrain.def(x, y).hazard) continue;
      const d = Math.min(...anchors.map(a => (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2));
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  if (!best) return { x: cx * T, y: (y0 + roomH * 0.3) * T };
  return { x: best.x * T + T / 2, y: best.y * T + T - 19 };   // 脚贴着地面
}

/** 碰到危险格才死：用玩家碰撞框（往里收 3 像素）和危险格的致命区域做矩形相交，不按格子粗判。返回死亡提示 */
export function touchingHazard(terrain: Terrain, b: { x: number; y: number; width: number; height: number }): string | null {
  const T = terrain.T, inset = 3;
  const px = b.x + inset, py = b.y + inset, pw = b.width - inset * 2, ph = b.height - inset * 2;
  const x0 = Math.floor(px / T), x1 = Math.floor((px + pw) / T), y0 = Math.floor(py / T), y1 = Math.floor((py + ph) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const def = terrain.def(tx, ty);
    if (!def.hazard) continue;
    const hb = def.hazardBox ?? { x: 0, y: 0, w: T, h: T };
    const hx = tx * T + hb.x, hy = ty * T + hb.y;
    if (px < hx + hb.w && px + pw > hx && py < hy + hb.h && py + ph > hy) return def.hazard;
  }
  return null;
}
