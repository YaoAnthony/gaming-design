import { describe, expect, it } from 'vitest';
import { stepPatrol, type Patrol, type PatrolState } from '@/world3d/patrol';

const P: Patrol = { from: { x: -4, y: 0, z: 10 }, to: { x: 4, y: 0, z: 10 }, speed: 2 };

describe('来回巡逻', () => {
  it('按速度往前走，朝向是走的方向', () => {
    const s: PatrolState = { k: 0, dir: 1 };
    const r = stepPatrol(P, s, 1);
    expect(r.at.x).toBeCloseTo(-2);
    expect(r.at.z).toBe(10);
    expect(r.heading.x).toBeCloseTo(1);
  });

  it('到头折回，永远在两点之间', () => {
    const s: PatrolState = { k: 0, dir: 1 };
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < 200; i++) { const { at } = stepPatrol(P, s, 0.1); minX = Math.min(minX, at.x); maxX = Math.max(maxX, at.x); }
    expect(minX).toBeGreaterThanOrEqual(-4);
    expect(maxX).toBeLessThanOrEqual(4);
    const atEnd: PatrolState = { k: 0.99, dir: 1 };
    const r = stepPatrol(P, atEnd, 0.5);
    expect(r.at.x).toBe(4);
    expect(r.heading.x).toBeCloseTo(-1);   // 到了 to，掉头
  });

  it('两点重合：不动，朝前', () => {
    const r = stepPatrol({ from: P.from, to: P.from, speed: 2 }, { k: 0, dir: 1 }, 1);
    expect(r.at).toEqual(P.from);
    expect(r.heading).toEqual({ x: 0, y: 0, z: 1 });
  });
});
