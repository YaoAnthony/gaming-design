import { describe, expect, it } from 'vitest';
import type { Block3D } from './level';
import { groundBelow, stepBody, type Body3D } from './physics';

const FLOOR: Block3D = { at: { x: 0, y: -1, z: 0 }, size: { x: 20, y: 1, z: 20 } };
const CRATE: Block3D = { at: { x: 3, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 } };
const G = 36, MAX_FALL = 28, DT = 1 / 60;

const body = (x: number, y: number, z: number): Body3D => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, half: 0.4, height: 1, grounded: false });
function run(b: Body3D, blocks: Block3D[], steps: number): void { for (let i = 0; i < steps; i++) stepBody(b, blocks, DT, G, MAX_FALL); }

describe('3D 世界的物理', () => {
  it('从空中落到地面上，站住', () => {
    const b = body(0, 5, 0);
    run(b, [FLOOR], 120);
    expect(b.pos.y).toBeCloseTo(0, 5);
    expect(b.grounded).toBe(true);
    expect(b.vel.y).toBe(0);
  });

  it('往箱子上走：被侧面挡住，不穿进去', () => {
    const b = body(0, 0, 0);
    for (let i = 0; i < 120; i++) { b.vel.x = 7; stepBody(b, [FLOOR, CRATE], DT, G, MAX_FALL); }
    expect(b.pos.x).toBeCloseTo(CRATE.at.x - CRATE.size.x / 2 - b.half, 5);
    expect(b.pos.y).toBeCloseTo(0, 5);
  });

  it('落在箱子顶上；走出箱子边就掉回地面', () => {
    const b = body(3, 4, 0);
    run(b, [FLOOR, CRATE], 120);
    expect(b.pos.y).toBeCloseTo(2, 5);
    expect(b.grounded).toBe(true);
    for (let i = 0; i < 40; i++) { b.vel.z = 7; stepBody(b, [FLOOR, CRATE], DT, G, MAX_FALL); }
    expect(b.pos.y).toBeCloseTo(0, 5);
  });

  it('跳起来头顶到上面的方块就停', () => {
    const ceiling: Block3D = { at: { x: 0, y: 1.5, z: 0 }, size: { x: 4, y: 1, z: 4 } };
    const b = body(0, 0, 0);
    b.vel.y = 13;
    run(b, [FLOOR, ceiling], 6);
    expect(b.pos.y + b.height).toBeLessThanOrEqual(1.5 + 1e-6);
  });

  it('走出地面边缘一直往下掉，下落速度有上限', () => {
    const b = body(30, 0, 0);
    run(b, [FLOOR], 200);
    expect(b.pos.y).toBeLessThan(-20);
    expect(b.vel.y).toBe(-MAX_FALL);
  });

  it('脚下的地面：在箱子上方是箱顶，旁边是地面，地面外面没有', () => {
    expect(groundBelow(body(3, 5, 0), [FLOOR, CRATE])).toBe(2);
    expect(groundBelow(body(0, 5, 0), [FLOOR, CRATE])).toBe(0);
    expect(groundBelow(body(30, 5, 0), [FLOOR, CRATE])).toBeNull();
  });
});
