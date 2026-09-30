import { describe, expect, it } from 'vitest';
import { bobOffset, fallTilt, freeCellAbove, KEY_BOB, KEY_LANDING, KEY_SQUASH, KEY_TILT, landingBounce, pushOutX, squashY } from './keyFall';

describe('钥匙落地弹跳', () => {
  it('落得太慢不弹', () => {
    expect(landingBounce(0)).toBe(0);
    expect(landingBounce(KEY_LANDING.minVy - 1)).toBe(0);
  });

  it('落得够快往上弹，弹起的速度按比例', () => {
    const v = KEY_LANDING.minVy * 3;
    expect(landingBounce(v)).toBeCloseTo(-v * KEY_LANDING.bounce);
    expect(landingBounce(v)).toBeLessThan(0);
  });

  it('从最快的下落速度掉下来，弹几下就停住', () => {
    let v = 900, bounces = 0;
    while (landingBounce(v) !== 0) { v = -landingBounce(v); bounces++; }
    expect(bounces).toBeGreaterThan(0);
    expect(bounces).toBeLessThanOrEqual(3);
  });
});

describe('停着时上下浮', () => {
  it('浮起的高度在 0 到 -幅度 之间', () => {
    for (let t = 0; t < KEY_BOB.periodMs * 2; t += 37) {
      const y = bobOffset(t, 1);
      expect(y).toBeLessThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(-KEY_BOB.amp);
    }
    expect(bobOffset(KEY_BOB.periodMs / 2, 1)).toBeCloseTo(-KEY_BOB.amp);
  });

  it('没停稳不浮', () => {
    expect(bobOffset(KEY_BOB.periodMs / 2, 0)).toBeCloseTo(0);
  });
});

describe('在空中歪一点', () => {
  it('在地上摆正，往下掉越快歪越多，有上限', () => {
    expect(fallTilt(500, true)).toBe(0);
    expect(fallTilt(100, false)).toBeGreaterThan(0);
    expect(fallTilt(300, false)).toBeGreaterThan(fallTilt(100, false));
    expect(fallTilt(100000, false)).toBe(KEY_TILT.max);
    expect(fallTilt(-100000, false)).toBe(-KEY_TILT.max);
  });
});

describe('落地压扁', () => {
  it('刚落地最扁，慢慢弹回原样，之后不扁', () => {
    expect(squashY(0)).toBeCloseTo(1 - KEY_SQUASH.amount);
    expect(squashY(KEY_SQUASH.ms / 2)).toBeGreaterThan(squashY(0));
    expect(squashY(KEY_SQUASH.ms)).toBe(1);
    expect(squashY(-Infinity)).toBe(1);
    expect(squashY(Infinity)).toBe(1);
  });
});

describe('被埋住时往上找空格', () => {
  // 一列：第 0、1 行空，第 2~4 行是砖
  const column = (x: number, y: number) => x === 0 && y >= 2 && y <= 4;

  it('没被埋：就是这一格', () => {
    expect(freeCellAbove(column, 0, 1)).toBe(1);
  });

  it('埋在砖里：上面第一格空的', () => {
    expect(freeCellAbove(column, 0, 4)).toBe(1);
  });

  it('一直到顶都是砖：找不到', () => {
    expect(freeCellAbove(() => true, 0, 4)).toBeNull();
    expect(freeCellAbove(column, 0, 4, 2)).toBeNull();
  });
});

describe('被带着撞进墙就推回去', () => {
  const T = 32;
  // 第 5 列第 2 行是一根横梁
  const bar = (x: number, y: number) => x === 5 && y === 2;

  it('往右撞进横梁：推回左边那一列，右边贴着横梁', () => {
    // 钥匙碰撞框宽 24，底边在第 3 行顶上；往右走到左边 150（跨第 4、5 列）
    expect(pushOutX(150, 24, 64 + 14, 96, T, bar)).toBe(5 * T - 24);
  });

  it('往左撞进横梁：推回右边那一列', () => {
    expect(pushOutX(5 * T + 20, 24, 64 + 14, 96, T, bar)).toBe(6 * T);
  });

  it('整个在一列里、或者两列都空、都是墙：不动', () => {
    expect(pushOutX(4 * T + 4, 24, 64 + 14, 96, T, bar)).toBeNull();
    expect(pushOutX(150, 24, 32 + 14, 64, T, bar)).toBeNull();   // 在上面一行，碰不到横梁
    expect(pushOutX(150, 24, 64 + 14, 96, T, () => true)).toBeNull();
  });
});
