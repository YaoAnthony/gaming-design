// 不建对象的矩形相交：和 Phaser 的 RectangleToRectangle 判定一模一样（换掉它不能改变碰撞手感）
import { describe, expect, it } from 'vitest';
import { overlaps } from '@/game/core/overlap';

/** Phaser 的原版判定（照抄 phaser/src/geom/intersects/RectangleToRectangle.js） */
function phaser(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return !(a.x + a.width < b.x || a.y + a.height < b.y || a.x > b.x + b.width || a.y > b.y + b.height);
}

describe('矩形相交', () => {
  it('和 Phaser 的判定逐个一致（随机矩形，含贴边、零宽）', () => {
    let seed = 3;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * 20) - 2; };
    for (let i = 0; i < 2000; i++) {
      const a = { x: r(), y: r(), width: r(), height: r() }, b = { x: r(), y: r(), width: r(), height: r() };
      expect(overlaps(a.x, a.y, a.width, a.height, b)).toBe(phaser(a, b));
    }
  });

  it('贴着边也算碰到', () => {
    expect(overlaps(0, 0, 10, 10, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
    expect(overlaps(0, 0, 10, 10, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });
});
