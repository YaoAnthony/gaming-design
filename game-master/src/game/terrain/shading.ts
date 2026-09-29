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

/** 这一格压多暗（0..1） */
export const shadeOf = (depth: number): number => SHADE_BY_DEPTH[Math.min(depth, SHADE_BY_DEPTH.length - 1)];
