// ===== 手感与规则参数 =====
export interface GameConfig {
  tile: number;
  viewW: number;
  viewH: number;
  gravity: number;
  moveSpeed: number;
  jumpVelocity: number;
  wallJumpX: number;
  wallJumpY: number;
  wallSlideMaxFall: number;
  wallJumpLockMs: number;
  coyoteMs: number;
  jumpBufferMs: number;
  /** 爆炸半径（格）：1.5 → 3x3；2.0 → 3x3 + 上下左右各一格 */
  explosionRadius: number;
  chunkGravity: number;
  chunkMaxFall: number;
  /** 碎块下落速度超过这个值才会压死人 / 压死怪 */
  crushMinSpeed: number;
  enemySpeed: number;
  roomPanMs: number;
}
