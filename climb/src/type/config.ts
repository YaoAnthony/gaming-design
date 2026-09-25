// ===== 手感与规则参数 =====
export interface GameConfig {
  tile: number;
  viewW: number;
  viewH: number;
  gravity: number;
  /** 玩家的宽 / 高（单位：格，1 = 一格）：贴图按这个缩放，碰撞框就是这个大小。高度小于 1 才能钻过一格高的缝 */
  playerWidth: number;
  playerHeight: number;
  moveSpeed: number;
  /** 戴帽子加多高（格）：主角 1 格 + 帽子 1 格 = 2 格高，能推 2x2 的箱子，但钻 1 格高的隧道时帽子会被撞掉 */
  hatHeight: number;
  /** 推箱子的速度（像素/秒），比走路慢 */
  pushSpeed: number;
  jumpVelocity: number;
  wallJumpX: number;
  wallJumpY: number;
  wallSlideMaxFall: number;
  /** 最大下落速度（像素/秒）。必须小于 60Hz 下 tileBias 允许的每步位移，否则会穿过砖块 */
  maxFall: number;
  /** 俯视层的移动速度（像素/秒） */
  topdownSpeed: number;
  /** 吃豆人 2 阶段（豆子吃光之后）：一开始能同时放几颗炸弹 */
  pacBaseBombs: number;
  /** 同时放炸弹的上限：每吃一颗大力丸 +1，到这里为止 */
  pacMaxBombs: number;
  /** 2 阶段每吃一颗大力丸，移动速度加多少（像素/秒）；死了清零 */
  pacBoostSpeed: number;
  wallJumpLockMs: number;
  coyoteMs: number;
  jumpBufferMs: number;
  /** 爆炸半径（格），也就是起跳爆炸的强度：1.5 → 3x3；2.0 → 3x3 + 上下左右各一格；2.5 → 5x5 去掉四角 */
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
  /** 两次吐小史莱姆之间至少隔多久（毫秒）；吐怪发生在扑击落地时 */
  bossSpitMs: number;
  /** Boss 房里同时最多几只小史莱姆（只数 Boss 吐出来、还活着、在这个房间里的） */
  bossMaxMinions: number;
  /** 小史莱姆的大小（相对普通怪物），碰撞框跟着一起缩 */
  bossMinionScale: number;
  /** 小史莱姆的颜色：把怪物贴图的色相转多少度（怪物是紫色，210 ≈ 绿色） */
  bossMinionHue: number;
  /** Boss 死亡时射出的穿墙火花：数量 / 速度（像素/秒）/ 存活秒数。碰到引线端点就点燃 */
  bossBurstCount: number;
  bossBurstSpeed: number;
  bossBurstTtl: number;
  /** 迷雾开关 */
  /** 光照传播半径（格）：从玩家出发沿空气逐格衰减，实心格挡光 */
  fogRadius: number;
  /** 见过但不在视野里的格子上残留的雾浓度（0 全清晰，1 全黑） */
  fogMemoryAlpha: number;
}
