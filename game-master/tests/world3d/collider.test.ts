import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { StaticCollider } from '@/world3d/collider';
import type { Body3D } from '@/world3d/physics';

/** 一个 2 × 2 × 2 的方块，中心在原点（顶面 y = 1） */
const cube = () => new StaticCollider(new THREE.BoxGeometry(2, 2, 2));
const body = (x: number, y: number, z: number, vel = { x: 0, y: 0, z: 0 }): Body3D => ({ pos: { x, y, z }, vel, half: 0.3, height: 1, grounded: false });

describe('StaticCollider', () => {
  it('不碰到就什么都不动', () => {
    const b = body(3, 0, 0);
    cube().resolve(b);
    expect(b.pos).toEqual({ x: 3, y: 0, z: 0 });
    expect(b.grounded).toBe(false);
  });

  it('脚陷进顶面：往上顶出来，算踩着，下落的速度清零', () => {
    const b = body(0, 0.8, 0, { x: 0, y: -5, z: 0 });
    cube().resolve(b);
    expect(b.pos.y).toBeCloseTo(1, 3);
    expect(b.grounded).toBe(true);
    expect(b.vel.y).toBe(0);
  });

  it('侧面撞进去：沿着撞的方向推出来，那个方向的速度清零', () => {
    const b = body(1.1, -0.5, 0, { x: -3, y: 0, z: 0 });
    cube().resolve(b);
    expect(b.pos.x).toBeCloseTo(1.3, 3);
    expect(b.vel.x).toBe(0);
    expect(b.grounded).toBe(false);
  });

  it('fromObject 按相对 root 的变换取三角形', () => {
    const root = new THREE.Group();
    root.scale.setScalar(0.1);   // 像 World3D 的 root 那样整体缩放：碰撞仍按格算
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    m.position.set(5, 0, 0);
    root.add(m);
    const c = StaticCollider.fromObject(root)!;
    const b = body(5, 0.8, 0);
    c.resolve(b);
    expect(b.pos.y).toBeCloseTo(1, 3);
    expect(StaticCollider.fromObject(new THREE.Group())).toBeNull();
  });
});
