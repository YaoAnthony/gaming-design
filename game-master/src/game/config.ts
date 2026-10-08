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
  explosionRadiusByStage: [null, 2, 5],   // 第 2 关（1.5 格高）炸 2 格、第 3 关（2 格高）炸 5 格；null = 用 explosionRadius
  chunkGravity: 1400,
  chunkMaxFall: 700,
  crushMinSpeed: 250,
  enemySpeed: 60,
  enemyPushMaxBox: 1,   // 夹子桑推得动多大的箱子（边长，格）：1 = 只推 1x1，2x2 推不动
  roomPanMs: 180,
  skill: 'blast',
  fuseDelayMs: 90,
  fuseIgniteRadius: 2.5,
  directionalBlast: false,
  directionalOffset: 2,
  deathReset: 'world',
  musicVolume: 0.35,
  playerHearts: 1,   // 开局 1 颗心；捡胶带上限 +1（mechanics/tape）
  hurtInvulnMs: 1500,
  hurtFlickerMs: 1000,
  hurtFlashMs: 150,
  knockbackX: 220,
  knockbackY: 300,
  knockbackMs: 220,
  bossHp: 6,
  bossHopMs: 1400,
  bossSpitMs: 5000,
  bossMaxMinions: 6,
  bossMinionScale: 0.65,
  bossBurstCount: 24,
  bossBurstSpeed: 380,
  bossBurstTtl: 2.5,
  lockChainDelayMs: 70,
  platePressedByRubble: false,
  moverSpeed: 64,       // 两格 / 秒
  moverPauseMs: 300,
  resetCrumple: true,
  respawnHandMs: 2000,
  respawnHandOn: { start: true, floor: true, death: true, reset: true, level: true },   // 玩家每次出现都由骷髅手放进来
  fogRadius: 1.5,   // 没有光源时只看得见身边；蜡烛等道具的照明半径在道具上（Items）
  fogMemoryAlpha: 0.6,
  fogUnseenAlpha: 0.85,
  sceneFx: { shadow: true, depth: true, vignette: true, dust: true, lights: true, shafts: true },
  stage3d: { fov: 40, tilt: { angle: 30, ms: 700 } },
  gmHand: {
    length: 0.36, carryTiles: 3, pixel: 1,
    light: [-0.45, 0.6, 0.65], ambient: 0.18, aoPower: 2,   // 光从左上前方来（和 Blender 里渲设计稿时一样）
    poseMs: 120,
    view: { open: { roll: 6, flip: true }, point: { roll: 18, flip: false }, pinch: { roll: 18, flip: false }, fist: { roll: 18, flip: false }, grip: { roll: 10, flip: false } },
    shadow: { x: 0, y: 6, opacity: 0.45 },
    armMargin: 40,
  },
  world3d: {
    actors: {
      bossHeight: 18, clipHeight: 0.9, clipSpeed: 1.8,   // Boss 比主角高近十倍、细长，像踩着高跷从桌子那头探过来
      bossHandLength: 1.5, bossHands: { left: { pose: 'open', roll: 0 }, right: { pose: 'fist', roll: 0 } },
      bossLight: { from: [10, 26, 20], color: '#9cbcf0', intensity: 6, angle: 26, penumbra: 0.7 },   // 一束冷光从前上方打在它上半身，让它从黑里浮出来
    },
    lighting: {
      lamp: { at: [-3, 13, 9], look: [-3, 0, 9], intensity: 3.4, angle: 42, penumbra: 0.6, color: '#ffe4b5', glow: 5 },   // 头顶一盏吊灯，只照亮舞台中间一圈
      ambient: { color: '#2b3650', intensity: 0.35 },                       // 灯外面是冷蓝的暗
      rim: { intensity: 0.55, color: '#4b6a9a', from: [-24, 16, 26] },    // 前方偏左上来一道很弱的冷光：黑里的 Boss 是深蓝的形，不是黑块
      fog: { color: '#06080f', near: 18, far: 52 },
      dust: { count: 260, size: 0.09, fall: 0.35, spread: 12, color: '#ffe9c4', opacity: 0.45 },
      vignette: 0.85,
    },
    toon: { dir: [-0.5, 0.8, 0.6], ambient: 0.18, aoPower: 2 },
    moveSpeed: 7, jumpVelocity: 13, gravity: 36, maxFall: 28,
    popOut: { out: 8, up: 9 },
    camera: { distance: 22, height: 7, lookUp: 4, followMs: 260 },   // 机位退远、压低：人很小，Boss 从黑里探出来
    returnMs: 700,
    rhythm: {
      heroZ: 0.75, tail: 0.2, heroScale: 2.5,
      travelBeats: 4, dropBeats: 1,
      windows: { perfect: 60, good: 130 }, passRatio: 0.6, bossTubes: 10, musicGain: 2.4,
      heroHp: 10, hurtGraceMs: 700, fadeOutMs: 2500,
      hitWindowMs: 80, barClear: 0.6,
      jumpVelocity: 21, gravity: 58,   // 跳 3.8 格高、滞空 0.72 秒
      enterMs: 900, cameraMs: 350, screenTilt: 50,
      sway: { zoom: 0, rollDeg: 0, nodDeg: 0, screenRollDeg: 0 },   // 都关着：晃起来头晕。想要再调大
    },
  },
};
