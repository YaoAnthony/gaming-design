import { describe, expect, it } from 'vitest';
import { SHADE_BY_DEPTH, depthToAir, shadeOf } from '@/game/terrain/shading';

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
