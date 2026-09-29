import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import { FogOfWar, ZONE_REVEAL_MS } from './Fog';

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

  it('亮区是圆不是菱形：对角 (3,3) 距离 4.24 在半径 5 内亮，(4,4) 距离 5.66 不亮', () => {
    const grid = Array.from({ length: 11 }, () => '.'.repeat(11).split(''));
    const l = FogOfWar.computeLight(grid, 5, 5, 5);
    const at = (x: number, y: number) => l[y * 11 + x];
    expect(at(8, 8)).toBeGreaterThan(0);        // 菱形下这格（曼哈顿距离 6）会是黑的
    expect(at(9, 9)).toBe(0);
    expect(at(10, 5)).toBeGreaterThan(0);       // 正右 5 格：圆的边缘
    expect(at(8, 8)).toBeCloseTo(at(2, 2));     // 对称
  });

  it('起点越界返回全黑', () => {
    expect([...FogOfWar.computeLight([['.']], 5, 5, 3)]).toEqual([0]);
  });
});

// 迷雾层只在构造时建 RenderTexture 和笔刷，测试里用一个什么都接住、链式返回自己的假场景
const fakeScene = (() => {
  const any: unknown = new Proxy(function () { /* 什么都不做 */ }, { get: () => any, apply: () => any });
  return any as Phaser.Scene;
})();

/** 两个房间 A | B，每个 4×3，中间一条走廊 */
const GRID = () => ['RRRRRRRR', 'R......R', 'RRRRRRRR'].map(r => r.split(''));
const make = (opts: { dark?: string[]; zones?: string[]; radius?: number; grid?: string[][] }) => new FogOfWar(fakeScene, opts.grid ?? GRID(), (opts.zones ?? ['........', '........', '........']).map(r => r.split('')), {
  tile: 32, roomW: 4, roomH: 3, radius: opts.radius ?? 1.5, memoryAlpha: 0.6, unseenAlpha: 0.85,
  keyAt: (rx, ry) => (ry === 0 ? ['A', 'B'][rx] ?? null : null),
  darkRooms: new Set(opts.dark ?? []),
});

describe('FogOfWar 迷雾区和全屋暗分开', () => {
  it('普通房间正常显示，只有迷雾区是黑的；踏进区里一格整区揭开，黑慢慢淡掉', () => {
    const fog = make({ zones: ['........', '.....11.', '........'] });
    fog.compute(1, 1, 0);
    expect(fog.clarity(2, 1)).toBe(1);
    expect(fog.clarity(4, 1)).toBe(1);          // 另一个房间，区外
    expect(fog.clarity(5, 1)).toBe(0);          // 区里：全黑
    expect(fog.isKnown(5, 1)).toBe(false);
    fog.compute(5, 1, 1000);
    expect(fog.isKnown(6, 1)).toBe(true);
    expect(fog.clarity(6, 1, 1000)).toBe(0);                          // 整区一起揭开，黑慢慢淡掉
    expect(fog.clarity(6, 1, 1000 + ZONE_REVEAL_MS / 2)).toBeCloseTo(0.5);
    expect(fog.clarity(5, 1, 1000 + ZONE_REVEAL_MS)).toBe(1);
  });

  it('全屋暗：视野里清楚，没见过的很暗但不是全黑，见过的是记忆；别的房间不受影响', () => {
    const fog = make({ dark: ['A'] });
    fog.compute(1, 1);
    expect(fog.clarity(1, 1)).toBe(1);
    expect(fog.clarity(3, 1)).toBeCloseTo(1 - 0.85);   // 离得远、没见过：隐约看得出轮廓
    expect(fog.clarity(5, 1)).toBe(1);                  // B 没开全屋暗
    expect(fog.isKnown(3, 1)).toBe(false);
    fog.compute(3, 1);
    expect(fog.clarity(1, 1)).toBeCloseTo(1 - 0.6);    // 走开了：记忆
  });

  it('全屋暗的房间里，迷雾区照到了也全黑，光也透不过去照亮后面；揭开后光能进去', () => {
    const fog = make({ dark: ['A', 'B'], zones: ['........', '...1....', '........'], radius: 6 });
    fog.compute(1, 1, 0);
    expect(fog.clarity(3, 1, 0)).toBe(0);              // 区里全黑
    expect(fog.clarity(4, 1, 0)).toBeCloseTo(1 - 0.85); // 区后面没光
    fog.compute(3, 1, 0);
    expect(fog.clarity(4, 1, ZONE_REVEAL_MS)).toBeGreaterThan(0.5);   // 揭开了，光透过去
  });

  it('区里的砖被炸掉了，整区揭开', () => {
    const grid = GRID();
    const fog = make({ zones: ['....11..', '....11..', '........'], grid });
    fog.compute(1, 1, 0);
    expect(fog.clarity(4, 1, 0)).toBe(0);
    grid[0][4] = '.';                                  // 区里的岩石被炸掉
    fog.compute(1, 1, 100);
    expect(fog.clarity(4, 1, 100 + ZONE_REVEAL_MS)).toBe(1);
    expect(fog.isKnown(5, 0)).toBe(true);
  });
});
