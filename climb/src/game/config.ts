// ===== 默认手感与规则参数 =====
// 运行时的值在 Redux 的 config slice 里，可以被调参面板改；这里只是默认值。
import type { GameConfig } from '@/type';

export const DEFAULT_CONFIG: GameConfig = {
  tile: 32,
  viewW: 640,
  viewH: 640,
  gravity: 1200,
  moveSpeed: 230,
  jumpVelocity: -560,
  wallJumpX: 260,
  wallJumpY: -560,
  wallSlideMaxFall: 120,
  wallJumpLockMs: 160,
  coyoteMs: 90,
  jumpBufferMs: 100,
  explosionRadius: 1.5,
  chunkGravity: 1400,
  chunkMaxFall: 700,
  crushMinSpeed: 250,
  enemySpeed: 60,
  roomPanMs: 180,
};
