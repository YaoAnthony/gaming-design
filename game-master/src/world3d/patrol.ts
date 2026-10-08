// ===== 来回巡逻（纯计算）：在两点之间走，到头就折回 =====
import type { Vec3 } from './level';

export interface Patrol { from: Vec3; to: Vec3; speed: number }
/** 走到了哪（0 = from，1 = to）、往哪头走 */
export interface PatrolState { k: number; dir: 1 | -1 }

const dist = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/** 走 dt 秒：返回现在在哪、朝哪（单位向量，往 to 走为正） */
export function stepPatrol(p: Patrol, s: PatrolState, dt: number): { at: Vec3; heading: Vec3 } {
  const len = dist(p.from, p.to);
  if (len > 1e-9 && p.speed > 0) {
    s.k += s.dir * p.speed * dt / len;
    if (s.k >= 1) { s.k = 1; s.dir = -1; } else if (s.k <= 0) { s.k = 0; s.dir = 1; }
  }
  const at = { x: p.from.x + (p.to.x - p.from.x) * s.k, y: p.from.y + (p.to.y - p.from.y) * s.k, z: p.from.z + (p.to.z - p.from.z) * s.k };
  const heading = len > 1e-9
    ? { x: (p.to.x - p.from.x) / len * s.dir, y: (p.to.y - p.from.y) / len * s.dir, z: (p.to.z - p.from.z) / len * s.dir }
    : { x: 0, y: 0, z: 1 };
  return { at, heading };
}
