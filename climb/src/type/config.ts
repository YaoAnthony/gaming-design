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
  /** 角色起跳技能的 id（见 game/registry/skills.ts） */
  skill: string;
  /** 引线每烧一格的间隔（毫秒） */
  fuseDelayMs: number;
  /** 引线两端能被点燃的距离（格），从爆炸中心算 */
  fuseIgniteRadius: number;
  /** 定向爆炸：地面起跳时按着左/右，爆炸中心往那边挪 directionalOffset 格 */
  directionalBlast: boolean;
  directionalOffset: number;
  /** 死亡时重置整张地图（否则只重置当前房间） */
  deathResetsWorld: boolean;
  /** 音乐音量 0-1 */
  musicVolume: number;
  /** Boss 参数 */
  bossHp: number;
  bossHopMs: number;
  bossSpitMs: number;
  bossMaxMinions: number;
  /** Boss 死亡时射出的穿墙火花：数量 / 速度（像素/秒）/ 存活秒数。碰到引线端点就点燃 */
  bossBurstCount: number;
  bossBurstSpeed: number;
  bossBurstTtl: number;
  /** 迷雾开关 */
  fogEnabled: boolean;
  /** 光照传播半径（格）：从玩家出发沿空气逐格衰减，实心格挡光 */
  fogRadius: number;
  /** 见过但不在视野里的格子上残留的雾浓度（0 全清晰，1 全黑） */
  fogMemoryAlpha: number;
}
