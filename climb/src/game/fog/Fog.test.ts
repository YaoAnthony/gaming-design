import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import { FogOfWar } from './Fog';

describe('FogOfWar.computeLight（光照扩散）', () => {
  it('光沿空气衰减，实心格被照亮但挡住后面', () => {
    const grid = [
      'RRRRRRRRR'.split(''),
      ['R', '.', '.', '.', 'R', '.', '.', '.', 'R'],   // (4,1) 是一堵墙，右边 (5..7,1) 在墙后
      'RRRRRRRRR'.split(''),
    ];
    const l = FogOfWar.computeLight(grid, 1, 1, 6);
    const at = (x: number, y: number) => l[y * grid[0].length + x];
    expect(at(1, 1)).toBe(1);
    expect(at(2, 1)).toBeGreaterThan(at(3, 1));
    expect(at(3, 1)).toBeGreaterThan(0);
    expect(at(4, 1)).toBeGreaterThan(0);        // 墙本身能看到
    expect(at(5, 1)).toBe(0);                   // 墙后全黑
    expect(at(1, 0)).toBeGreaterThan(0);        // 头顶的岩石也被照亮
  });

  it('超过半径就全黑', () => {
    const grid = ['R.........R'.split('')];
    const l = FogOfWar.computeLight(grid, 1, 0, 3);
    expect(l[4]).toBeGreaterThan(0);
    expect(l[5]).toBe(0);
  });

  it('起点越界返回全黑', () => {
    expect([...FogOfWar.computeLight([['.']], 5, 5, 3)]).toEqual([0]);
  });
});
