import { describe, expect, it } from 'vitest';
import { WALL_E, WALL_N, WALL_NE, WALL_NW, WALL_S, WALL_SE, WALL_SW, WALL_W, WALL_VARIANTS, normalizeWallMask, wallQuarters, wallVariant } from './walls';

describe('墙的拼贴', () => {
  it('8 个邻居一共 47 种不同的样子（斜角只有两边都连着时才算）', () => {
    expect(WALL_VARIANTS.length).toBe(47);
    expect(normalizeWallMask(WALL_NE)).toBe(0);                         // 光有斜角，两边都不连：跟孤零零一块一样
    expect(normalizeWallMask(WALL_N | WALL_E | WALL_NE)).toBe(WALL_N | WALL_E | WALL_NE);
    expect(wallVariant(WALL_NE | WALL_SE)).toBe(wallVariant(0));
  });

  it('四周全是墙 = 四个角都是中间（黑色内部）', () => {
    expect(wallQuarters(255)).toEqual(['C', 'C', 'C', 'C']);
  });

  it('孤零零一块 = 四个外角', () => {
    expect(wallQuarters(0)).toEqual(['TL', 'TR', 'BL', 'BR']);
  });

  it('大块墙的上边：上面是空的，左右下都连着', () => {
    expect(wallQuarters(0xff & ~(WALL_N | WALL_NE | WALL_NW))).toEqual(['T', 'T', 'C', 'C']);
  });

  it('一格厚的横平台中间：上下都是空的，左右连着 → 上边 + 下边拼在一格里', () => {
    expect(wallQuarters(WALL_E | WALL_W)).toEqual(['T', 'T', 'B', 'B']);
  });

  it('凹进去的内角：上、左都连着，只有左上斜角是空的 → 左上折角', () => {
    expect(wallQuarters(0xff & ~WALL_NW)).toEqual(['iTL', 'C', 'C', 'C']);
  });

  it('竖墙左边：左边是空的', () => {
    expect(wallQuarters(0xff & ~(WALL_W | WALL_NW | WALL_SW))).toEqual(['L', 'C', 'L', 'C']);
    expect(wallQuarters(WALL_N | WALL_S)).toEqual(['L', 'R', 'L', 'R']);   // 一格宽的竖柱
  });
});
