// ===== 地形的体积感：实心砖越往里越暗 =====
// 每块实心砖离最近的空气有几格（8 方向；地图外面算实心，所以边上的大块岩石往外也越来越暗）；
// 挨着空气的表面不压暗，往里一层层加深。画成一格一个点的小图、平滑放大盖在地形上（见 Terrain.enableShading），是柔和的渐变。

/** 离空气第几格压多暗：[空气, 表面, 第 2 层, 第 3 层, 第 4 层及更深] */
export const SHADE_BY_DEPTH = [0, 0, 0.22, 0.4, 0.55];

/** 每格离最近的空气有几格（空气 = 0，挨着空气的实心格 = 1），最多算到 cap */
export function depthToAir(w: number, h: number, solid: (x: number, y: number) => boolean, cap = SHADE_BY_DEPTH.length - 1): Uint8Array {
  const d = new Uint8Array(w * h).fill(cap);
  const q: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y)) { d[y * w + x] = 0; q.push(y * w + x); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i - x) / w, nd = d[i] + 1;
    if (nd >= cap) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (d[j] > nd) { d[j] = nd; q.push(j); }
    }
  }
  return d;
}

/** 地图上的一块矩形（格） */
export interface CellRect { x: number; y: number; w: number; h: number }

/**
 * 只重算一块：changed 里的格子变了，离它们 cap 格以内的深度才可能变。在往外再扩 cap 格的窗口里算一遍
 * （窗口外当实心，就像地图外面），只交回往外扩 cap 格的那一块（out）——那一块里每一格离空气多远都在窗口里看得到，和整张图算的一样。
 * 一跳只炸几格，这样比整张图重算（最大一层九千多格）快得多
 */
export function depthToAirAround(mapW: number, mapH: number, solid: (x: number, y: number) => boolean, changed: CellRect, cap = SHADE_BY_DEPTH.length - 1): { out: CellRect; depth: Uint8Array } {
  const clip = (r: CellRect, pad: number): CellRect => {
    const x0 = Math.max(0, r.x - pad), y0 = Math.max(0, r.y - pad), x1 = Math.min(mapW, r.x + r.w + pad), y1 = Math.min(mapH, r.y + r.h + pad);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  };
  const out = clip(changed, cap), win = clip(changed, cap * 2);
  const d = depthToAir(win.w, win.h, (x, y) => solid(win.x + x, win.y + y), cap);
  const depth = new Uint8Array(out.w * out.h);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) depth[y * out.w + x] = d[(out.y - win.y + y) * win.w + (out.x - win.x + x)];
  return { out, depth };
}

/** 这一格压多暗（0..1） */
export const shadeOf = (depth: number): number => SHADE_BY_DEPTH[Math.min(depth, SHADE_BY_DEPTH.length - 1)];
