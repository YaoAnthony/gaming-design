import { describe, expect, it } from 'vitest';
import { armReach, cubicBezier, easeMove, handOrientation, lerpAngle, toPage } from '@/stage3d/hand/placement';

describe('木手怎么摆', () => {
  it('从哪边伸进来：指尖朝那边的对面；从右边来是镜像', () => {
    const tip = (from: 'left' | 'right' | 'top' | 'bottom') => toPage({ x: 1, y: 0 }, handOrientation(from));
    expect(tip('left').x).toBeCloseTo(1); expect(tip('left').y).toBeCloseTo(0);
    expect(tip('right').x).toBeCloseTo(-1);
    expect(tip('top').y).toBeCloseTo(1);     // 页面 y 朝下：指尖朝下
    expect(tip('bottom').y).toBeCloseTo(-1);
    expect(handOrientation('right').mirror).toBe(true);
    expect(handOrientation('top', 10).angle).toBe(100);
  });

  it('镜像不改变手背朝哪：从右边来时拇指那侧还在同一边', () => {
    // 手本地 y（镜像不动的那根轴）从左边来和从右边来都一样
    const l = toPage({ x: 0, y: 1 }, handOrientation('left')), r = toPage({ x: 0, y: 1 }, handOrientation('right'));
    expect(r.x).toBeCloseTo(l.x); expect(r.y).toBeCloseTo(l.y);
  });

  it('前臂伸到画面外：从画面里的点往左要走到左边缘，再多 margin', () => {
    expect(armReach({ x: 300, y: 200 }, { x: -1, y: 0 }, { w: 800, h: 600 }, 40)).toBeCloseTo(340);
    expect(armReach({ x: 300, y: 200 }, { x: 0, y: -1 }, { w: 800, h: 600 }, 40)).toBeCloseTo(240);
    // 斜着走：先碰到哪条边算哪条
    expect(armReach({ x: 100, y: 500 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, { w: 800, h: 600 }, 0)).toBeCloseTo(100 * Math.SQRT2);
  });

  it('前臂的起点已经在画面外、还往外走：只剩 margin', () => {
    expect(armReach({ x: -50, y: 200 }, { x: -1, y: 0 }, { w: 800, h: 600 }, 40)).toBe(40);
  });

  it('缓动：两头是 0 和 1，中间单调往上', () => {
    expect(easeMove(0)).toBe(0);
    expect(easeMove(1)).toBe(1);
    let prev = 0;
    for (let t = 0.05; t < 1; t += 0.05) { const v = easeMove(t); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 3);
  });

  it('角度走最短的路', () => {
    expect(lerpAngle(170, -170, 0.5)).toBeCloseTo(180);
    expect(lerpAngle(-90, 90, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(10, 20, 0.25)).toBeCloseTo(12.5);
  });
});
