// ===== 默认手感与规则参数 =====
// 运行时的值在 Redux 的 config slice 里，可以被调参面板改；这里只是默认值。
import type { GameConfig } from '@/type';

export const DEFAULT_CONFIG: GameConfig = {
  tile: 32,
  viewW: 640,
  viewH: 640,
  gravity: 1200,
  playerWidth: 0.94,   // 格（主角是一格见方的方块，宽高一样）
  playerHeight: 0.94,  // 格：比一格矮一点，能稳稳钻过一格高的缝（正好 1 会贴着天花板卡住）
  playerHitboxWidth: 0.75,   // 格：碰撞框比贴图窄，一格宽的洞更容易掉下去
  moveSpeed: 230,
  hatHeight: 1,
  pushSpeed: 90,
  growMs: 2500,
  jumpVelocity: -560,
  jumpVelocityByStage: [-490, -560, -600],   // 1 格高 ≈ 跳 3 格，1.5 格高 = 原版（≈ 3.9 格），2 格高 ≈ 跳 4.5 格
  wallJumpX: 260,
  wallJumpY: -560,
  wallSlideMaxFall: 120,
  maxFall: 900,
  topdownSpeed: 120,
  pacBaseBombs: 1,
  pacMaxBombs: 5,
  pacBoostSpeed: 15,
  wallJumpLockMs: 160,
  coyoteMs: 90,
  jumpBufferMs: 100,
  explosionRadius: 1.5,
  explosionRadiusByStage: [null, null, 5],   // 第 3 关（2 格高）炸 5 格；null = 用 explosionRadius
  chunkGravity: 1400,
  chunkMaxFall: 700,
  crushMinSpeed: 250,
  enemySpeed: 60,
  roomPanMs: 180,
  skill: 'blast',
  fuseDelayMs: 90,
  fuseIgniteRadius: 2.5,
  directionalBlast: false,
  directionalOffset: 2,
  deathResetsWorld: true,
  musicVolume: 0.35,
  bossHp: 6,
  bossHopMs: 1400,
  bossSpitMs: 5000,
  bossMaxMinions: 6,
  bossMinionScale: 0.65,
  bossMinionHue: 210,
  bossBurstCount: 24,
  bossBurstSpeed: 380,
  bossBurstTtl: 2.5,
  fogRadius: 1.5,   // 没有光源时只看得见身边；蜡烛等道具的照明半径在道具上（Items）
  fogMemoryAlpha: 0.6,
};
