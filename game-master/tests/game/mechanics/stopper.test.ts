// 挡块：路中间立在正中，崖边立在悬崖那一边的格线上；箱子跨格线时挡不挡
import { describe, expect, it } from 'vitest';
import { crossBlocked, stopperBar, stopperMount, type StopperCell } from '@/game/mechanics/stopper/geometry';

/** 字符画：# 实心，. 空 */
const ground = (rows: string[]) => {
  const solid = (x: number, y: number) => rows[y]?.[x] === '#';
  return { solid, footing: solid };
};

describe('stopperMount', () => {
  it('路中间：两边都有地 → 正中', () => {
    const g = ground(['.....', '#####']);
    expect(stopperMount(g, 2, 0)).toBe('center');
  });
  it('右边是悬崖 → 立在右边格线上；左边是悬崖 → 左边', () => {
    expect(stopperMount(ground(['.....', '###..']), 2, 0)).toBe('right');
    expect(stopperMount(ground(['.....', '..###']), 2, 0)).toBe('left');
  });
  it('旁边是墙不算悬崖；一格宽的柱子（两边都空）→ 正中；脚下没东西 → 失效', () => {
    expect(stopperMount(ground(['...#.', '###..']), 2, 0)).toBe('center');
    expect(stopperMount(ground(['.....', '..#..']), 2, 0)).toBe('center');
    expect(stopperMount(ground(['.....', '##.##']), 2, 0)).toBeNull();
  });
});

describe('stopperBar', () => {
  it('正中在格子中线上；崖边在这一格里靠悬崖那边、离崖边留 inset；底边贴地', () => {
    expect(stopperBar('center', 2, 3, 32, 6, 26, 4)).toEqual({ x: 2 * 32 + 13, y: 4 * 32 - 26, w: 6, h: 26 });
    expect(stopperBar('right', 2, 3, 32, 6, 26, 4).x).toBe(3 * 32 - 4 - 6);
    expect(stopperBar('left', 2, 3, 32, 6, 26, 4).x).toBe(2 * 32 + 4);
  });
});

describe('crossBlocked', () => {
  const at = (x: number, mount: StopperCell['mount']): StopperCell[] => [{ x, y: 5, mount }];
  it('挡块那一格从两边都进不去，不管立在正中还是崖边', () => {
    expect(crossBlocked(at(4, 'center'), 3, 5, 1)).toBe(true);
    expect(crossBlocked(at(4, 'center'), 5, 5, -1)).toBe(true);
    expect(crossBlocked(at(4, 'right'), 3, 5, 1)).toBe(true);
    expect(crossBlocked(at(4, 'left'), 5, 5, -1)).toBe(true);
  });
  it('别的格子、别的行、失效的不挡', () => {
    expect(crossBlocked(at(4, 'center'), 2, 5, 1)).toBe(false);
    expect(crossBlocked([{ x: 4, y: 6, mount: 'right' }], 3, 5, 1)).toBe(false);
    expect(crossBlocked(at(4, null), 3, 5, 1)).toBe(false);
  });
});
