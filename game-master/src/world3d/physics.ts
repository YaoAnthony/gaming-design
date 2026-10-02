// ===== 3D 世界的物理：一个竖着的方柱（人）在一堆实心方块之间走、跳、落 =====
// 纯计算，不碰 three：按 x、z、y 三个轴分开挪，挪完哪个轴撞进方块就沿那个轴推出来
import type { Block3D, Vec3 } from './level';

/** 人：pos 是脚底中心；half = 身宽的一半（x、z 两个方向一样），height = 身高 */
export interface Body3D {
  pos: Vec3;
  vel: Vec3;
  half: number;
  height: number;
  /** 这一步结束时脚下踩着东西 */
  grounded: boolean;
}

/** 碰撞算重叠时留的缝：贴着墙走不算撞进去 */
const SKIN = 1e-4;

function overlaps(b: Body3D, k: Block3D): boolean {
  return b.pos.x + b.half > k.at.x - k.size.x / 2 + SKIN && b.pos.x - b.half < k.at.x + k.size.x / 2 - SKIN
    && b.pos.z + b.half > k.at.z - k.size.z / 2 + SKIN && b.pos.z - b.half < k.at.z + k.size.z / 2 - SKIN
    && b.pos.y + b.height > k.at.y + SKIN && b.pos.y < k.at.y + k.size.y - SKIN;
}

/** 走一步（dt 秒）：重力、移动、和方块的碰撞 */
export function stepBody(b: Body3D, blocks: readonly Block3D[], dt: number, gravity: number, maxFall: number): void {
  b.vel.y = Math.max(-maxFall, b.vel.y - gravity * dt);

  b.pos.x += b.vel.x * dt;
  for (const k of blocks) {
    if (!overlaps(b, k)) continue;
    b.pos.x = b.vel.x > 0 ? k.at.x - k.size.x / 2 - b.half : k.at.x + k.size.x / 2 + b.half;
    b.vel.x = 0;
  }
  b.pos.z += b.vel.z * dt;
  for (const k of blocks) {
    if (!overlaps(b, k)) continue;
    b.pos.z = b.vel.z > 0 ? k.at.z - k.size.z / 2 - b.half : k.at.z + k.size.z / 2 + b.half;
    b.vel.z = 0;
  }
  b.grounded = false;
  b.pos.y += b.vel.y * dt;
  for (const k of blocks) {
    if (!overlaps(b, k)) continue;
    if (b.vel.y > 0) b.pos.y = k.at.y - b.height;             // 头顶到了
    else { b.pos.y = k.at.y + k.size.y; b.grounded = true; }  // 落在上面
    b.vel.y = 0;
  }
}

/** 人脚下最近的地面有多高（影子画在那）；脚下什么都没有返回 null */
export function groundBelow(b: Body3D, blocks: readonly Block3D[]): number | null {
  let top: number | null = null;
  for (const k of blocks) {
    if (b.pos.x + b.half <= k.at.x - k.size.x / 2 || b.pos.x - b.half >= k.at.x + k.size.x / 2) continue;
    if (b.pos.z + b.half <= k.at.z - k.size.z / 2 || b.pos.z - b.half >= k.at.z + k.size.z / 2) continue;
    const y = k.at.y + k.size.y;
    if (y <= b.pos.y + SKIN && (top === null || y > top)) top = y;
  }
  return top;
}
