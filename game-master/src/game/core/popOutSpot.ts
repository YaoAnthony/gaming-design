// ===== 人从 3D 世界走回画面时落在哪（纯计算）=====
// 想落的地方人站得下就用它；那里是墙或者尖刺，就在这个房间里找最近的一格安全的空地（脚踩在那一格的底边上）；
// 实在没有安全的地方才落在危险格里

export interface SpotQuery {
  /** 想落在哪（人的中心，像素） */
  want: { x: number; y: number };
  /** 人的碰撞框宽高（像素）、一格多少像素 */
  bodyW: number;
  bodyH: number;
  tile: number;
  /** 这个房间占的格子范围（左上角那格，宽高几格） */
  room: { x0: number; y0: number; w: number; h: number };
  /** 这一格被挡住了（实心地形、机制的实心物件） */
  blocked(cx: number, cy: number): boolean;
  /** 这一格碰了会受伤（尖刺） */
  hazard(cx: number, cy: number): boolean;
}

/** 人的中心在 (x, y) 时，碰撞框盖到的格子都在房间里、都没被挡住；safe = 也都不是危险格 */
function fits(q: SpotQuery, x: number, y: number, safe: boolean): boolean {
  const e = 1e-3, T = q.tile;
  const x0 = Math.floor((x - q.bodyW / 2 + e) / T), x1 = Math.floor((x + q.bodyW / 2 - e) / T);
  const y0 = Math.floor((y - q.bodyH / 2 + e) / T), y1 = Math.floor((y + q.bodyH / 2 - e) / T);
  if (x0 < q.room.x0 || y0 < q.room.y0 || x1 >= q.room.x0 + q.room.w || y1 >= q.room.y0 + q.room.h) return false;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (q.blocked(cx, cy) || (safe && q.hazard(cx, cy))) return false;
  return true;
}

/** 落点（人的中心，像素）；整个房间都站不下返回 null */
export function landingSpot(q: SpotQuery): { x: number; y: number } | null {
  return nearest(q, true) ?? nearest(q, false);
}

function nearest(q: SpotQuery, safe: boolean): { x: number; y: number } | null {
  if (fits(q, q.want.x, q.want.y, safe)) return { ...q.want };
  const T = q.tile;
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (let cy = q.room.y0; cy < q.room.y0 + q.room.h; cy++) {
    for (let cx = q.room.x0; cx < q.room.x0 + q.room.w; cx++) {
      const x = cx * T + T / 2, y = (cy + 1) * T - q.bodyH / 2;
      const d = (x - q.want.x) ** 2 + (y - q.want.y) ** 2;
      if (d < bestD && fits(q, x, y, safe)) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}
