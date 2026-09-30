import { describe, expect, it } from 'vitest';
import { rectHitsCells, solidRuns } from './solid';

const cells = (rows: string[], x0 = 10, y0 = 20) =>
  rows.flatMap((r, y) => [...r].flatMap((ch, x) => (ch === '#' ? [{ x: x0 + x, y: y0 + y }] : [])));

const all = { up: true, down: true, left: true, right: true };

describe('solidRuns：格子并成横条，算好外露面', () => {
  it('一张平纸是一条，四面都外露', () => {
    expect(solidRuns(cells(['####']))).toEqual([{ x: 10, y: 20, len: 4, faces: all }]);
  });

  it('竖条：一格一条，中间那格上下两面不外露（贴着侧面跳不会在接缝上撞头）', () => {
    expect(solidRuns(cells(['#', '#', '#']))).toEqual([
      { x: 10, y: 20, len: 1, faces: { ...all, down: false } },
      { x: 10, y: 21, len: 1, faces: { ...all, up: false, down: false } },
      { x: 10, y: 22, len: 1, faces: { ...all, up: false } },
    ]);
  });

  it('小船：船沿底面不外露；船底按上面有没有船沿分成三条，只有船舱底那条顶面外露', () => {
    expect(solidRuns(cells(['#...#', '#####'], 0, 0))).toEqual([
      { x: 0, y: 0, len: 1, faces: { ...all, down: false } },
      { x: 4, y: 0, len: 1, faces: { ...all, down: false } },
      { x: 0, y: 1, len: 1, faces: { ...all, up: false, right: false } },
      { x: 1, y: 1, len: 3, faces: { ...all, left: false, right: false } },
      { x: 4, y: 1, len: 1, faces: { ...all, up: false, left: false } },
    ]);
  });

  it('同一行相邻但上下外露不一样的格子不并（移动方块的 L 形）', () => {
    expect(solidRuns([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }])).toEqual([
      { x: 0, y: 0, len: 1, faces: { ...all, right: false } },
      { x: 1, y: 0, len: 1, faces: { ...all, down: false, left: false } },
      { x: 3, y: 0, len: 1, faces: all },
      { x: 1, y: 1, len: 1, faces: { ...all, up: false } },
    ]);
  });

  it('实心方块：只有外圈的面外露', () => {
    expect(solidRuns(cells(['##', '##'], 0, 0))).toEqual([
      { x: 0, y: 0, len: 2, faces: { ...all, down: false } },
      { x: 0, y: 1, len: 2, faces: { ...all, up: false } },
    ]);
  });
});

describe('rectHitsCells：像素矩形盖到的格子', () => {
  const solid = (cx: number, cy: number) => cx === 3 && cy === 1;
  it('盖到实心格就算撞；右边、下边是开区间', () => {
    expect(rectHitsCells(90, 100, 40, 50, 32, solid)).toBe(true);    // (2.8..3.1, 1.25..1.56) 格
    expect(rectHitsCells(64, 96, 32, 64, 32, solid)).toBe(false);    // 正好是 (2,1) 那一格，不碰 (3,1)
    expect(rectHitsCells(96, 100, 64, 70, 32, solid)).toBe(false);   // (3,2)
  });
});
