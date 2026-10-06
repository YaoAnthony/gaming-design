import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { buildMoverGroups, canCarry, stepBlocked } from '@/game/mechanics/mover/kinds';

describe('移动方块：能不能放、怎么分组', () => {
  it('只能放在实心、自己不会掉的砖上：岩石 / 碎岩可以，沙土 / 脆岩 / 纸 / 空气 / 尖刺不行', () => {
    expect(['R', 'r', '=', '_'].map(canCarry)).toEqual([true, true, true, true]);
    expect(['S', 'B', 'Z', '.', 'X'].map(canCarry)).toEqual([false, false, false, false, false]);
  });

  it('相连的同一种标记是一组；不同种、隔开的各是一组；带重力的砖上的标记忽略', () => {
    const markers = ['hh.v', 'h..v', '....', 'hh..'];
    const tiles   = ['RRrR', 'S..R', '....', 'rr..'];   // (0,1) 是沙土：那一格的标记不算
    const groups = buildMoverGroups(markers, tiles);
    expect(groups.map(g => [g.kind.ch, g.cells.map(c => `${c.x},${c.y}`).join(' ')])).toEqual([
      ['h', '0,0 1,0'],
      ['v', '3,0 3,1'],
      ['h', '0,3 1,3'],
    ]);
  });
});

describe('移动方块：撞没撞', () => {
  const wall = new Set(['3,0']);
  const blocked = (x: number, y: number) => wall.has(`${x},${y}`);

  it('整组任何一格的下一格被挡就算撞；组里自己的格子不算挡', () => {
    expect(stepBlocked([{ x: 1, y: 0 }, { x: 2, y: 0 }], 1, 0, blocked)).toBe(true);    // 右边那格前面是墙
    expect(stepBlocked([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, 0, blocked)).toBe(false);   // 往右一格是自己
    expect(stepBlocked([{ x: 0, y: 1 }, { x: 2, y: 1 }], 0, -1, blocked)).toBe(false);
    expect(stepBlocked([{ x: 0, y: 1 }, { x: 3, y: 1 }], 0, -1, blocked)).toBe(true);    // 只要有一格往上撞墙
  });
});
