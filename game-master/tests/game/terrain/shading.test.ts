import { describe, expect, it } from 'vitest';
import { SHADE_BY_DEPTH, depthToAir, depthToAirAround, shadeOf } from '@/game/terrain/shading';

describe('地形的体积感：离空气几格', () => {
  it('一块 5×5 的实心：最外圈是表面（1），往里 2、3；空气是 0', () => {
    const solid = (x: number, y: number) => x >= 1 && x <= 5 && y >= 1 && y <= 5;
    const d = depthToAir(7, 7, solid);
    const at = (x: number, y: number) => d[y * 7 + x];
    expect(at(0, 0)).toBe(0);
    expect(at(1, 1)).toBe(1);
    expect(at(3, 1)).toBe(1);
    expect(at(2, 2)).toBe(2);
    expect(at(3, 3)).toBe(3);
  });

  it('整张图都是实心（没有空气）：全都算最深；地图外面不算空气', () => {
    const d = depthToAir(3, 3, () => true);
    expect([...d].every(v => v === SHADE_BY_DEPTH.length - 1)).toBe(true);
  });

  it('表面不压暗，越深越暗，再深就不再加', () => {
    expect(shadeOf(0)).toBe(0);
    expect(shadeOf(1)).toBe(0);
    expect(shadeOf(2)).toBeGreaterThan(0);
    expect(shadeOf(3)).toBeGreaterThan(shadeOf(2));
    expect(shadeOf(99)).toBe(SHADE_BY_DEPTH[SHADE_BY_DEPTH.length - 1]);
  });
});

describe('只重算变过的那一块（depthToAirAround）', () => {
  /** 固定种子的随机数：每次跑都一样 */
  const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  it('交回来的那一块和整张图重算的结果一模一样（随机地图、随机改几格，跑很多遍）', () => {
    const rand = rng(7), W = 40, H = 25;
    for (let round = 0; round < 60; round++) {
      const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => rand() < 0.7));
      const solid = (x: number, y: number) => grid[y][x];
      const cx = Math.floor(rand() * W), cy = Math.floor(rand() * H), cw = 1 + Math.floor(rand() * 4), ch = 1 + Math.floor(rand() * 3);
      for (let y = cy; y < Math.min(H, cy + ch); y++) for (let x = cx; x < Math.min(W, cx + cw); x++) grid[y][x] = !grid[y][x];
      const full = depthToAir(W, H, solid);
      const { out, depth } = depthToAirAround(W, H, solid, { x: cx, y: cy, w: cw, h: ch });
      for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) expect(depth[y * out.w + x]).toBe(full[(out.y + y) * W + out.x + x]);
    }
  });

  it('改动在地图边上：范围裁到地图里面，不越界', () => {
    const { out } = depthToAirAround(10, 6, () => true, { x: 0, y: 0, w: 1, h: 1 });
    expect(out).toEqual({ x: 0, y: 0, w: 1 + (SHADE_BY_DEPTH.length - 1), h: 1 + (SHADE_BY_DEPTH.length - 1) });
  });
});
