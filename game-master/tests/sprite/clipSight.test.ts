// 夹子桑的视野：同一层、range 格内、中间没墙
import { describe, expect, it } from 'vitest';
import { clipSees } from '@/sprite/clipSight';

const T = 32;
/** 站在第 row 行格子里、身子中线在第 col 列的盒子（宽 w、高 h，脚底贴着格子底边） */
const at = (col: number, row: number, w = 14, h = 28) => {
  const cx = col * T + T / 2, bottom = (row + 1) * T;
  return { left: cx - w / 2, right: cx + w / 2, top: bottom - h, bottom };
};
const open = () => false;

describe('clipSees', () => {
  it('同一层、范围内看得见，前后都看', () => {
    expect(clipSees(at(10, 5), at(14, 5, 24, 30), T, open, 5, 1)).toBe(true);
    expect(clipSees(at(10, 5), at(6, 5, 24, 30), T, open, 5, 1)).toBe(true);
  });

  it('超出范围看不见', () => {
    expect(clipSees(at(10, 5), at(17, 5, 24, 30), T, open, 5, 1)).toBe(false);
  });

  it('上下差一格内算同一层，再高就看不见', () => {
    expect(clipSees(at(10, 5), at(12, 4, 24, 30), T, open, 5, 1)).toBe(true);
    expect(clipSees(at(10, 5), at(12, 3, 24, 30), T, open, 5, 1)).toBe(false);
  });

  it('中间那一行有墙挡着就看不见；墙在两人脚下、身后不算', () => {
    const wall = (x: number, y: number) => x === 12 && y === 5;
    expect(clipSees(at(10, 5), at(14, 5, 24, 30), T, wall, 5, 1)).toBe(false);
    expect(clipSees(at(10, 5), at(12, 4, 24, 30), T, wall, 5, 1)).toBe(true);   // 主角站在那块墙上面
    expect(clipSees(at(14, 5), at(16, 5, 24, 30), T, wall, 5, 1)).toBe(true);   // 墙在夹子身后
  });
});
