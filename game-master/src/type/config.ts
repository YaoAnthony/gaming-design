// ===== 手感与规则参数 =====

/** 玩家出现在地图上的几种场合：开局（开始游戏 / 再来一次 / 编辑器试玩）、换层、死后复活、按 R 重置房间、进入下一关 */
export type AppearReason = 'start' | 'floor' | 'death' | 'reset' | 'level';
export interface GameConfig {
  tile: number;
  viewW: number;
  viewH: number;
  gravity: number;
  /** 玩家的宽 / 高（单位：格，1 = 一格）：贴图按这个缩放，碰撞框就是这个大小。高度小于 1 才能钻过一格高的缝 */
  playerWidth: number;
  playerHeight: number;
  /** 碰撞框的宽（格），比贴图窄：宽度接近一格时，走过一格宽的洞一帧就跨过去了，掉不下去 */
  playerHitboxWidth: number;
  moveSpeed: number;
  /** 戴帽子加多高（格）：主角 1 格 + 帽子 1 格 = 2 格高，能推 2x2 的箱子，但钻 1 格高的隧道时帽子会被撞掉 */
  hatHeight: number;
  /** 推箱子的速度（像素/秒），比走路慢 */
  pushSpeed: number;
  /** 假通关进下一层后，身体从 1 格长到 2 格的动画时长（毫秒） */
  growMs: number;
  /** 起跳速度：这是第 2 阶段（1.5 格高）的原版手感 */
  jumpVelocity: number;
  /** 每个长大阶段的起跳速度（像素/秒，负数向上）：[1 格高, 1.5 格高, 2 格高]。蹬墙跳按 wallJumpY / jumpVelocity 的比例一起变 */
  jumpVelocityByStage: number[];
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
  /** 每个长大阶段的爆炸半径（格）：[1 格高, 1.5 格高, 2 格高]；null = 用 explosionRadius */
  explosionRadiusByStage: (number | null)[];
  chunkGravity: number;
  chunkMaxFall: number;
  /** 碎块下落速度超过这个值才会压死人 / 压死怪 */
  crushMinSpeed: number;
  enemySpeed: number;
  /** 史莱姆顶着走能推动的最大箱子边长（格）；0 = 推不动箱子 */
  enemyPushMaxBox: number;
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
  /**
   * 死了之后重置什么：
   * - none：什么都不重置，解过的就算解过了（炸掉的砖、烧过的引线、开过的门、推过的箱子、打死的怪都保持原样），人回到这个房间的入口；
   *   R 重置当前房间（卡关时的出路）。Boss 战打到一半、吃豆人层被抓到例外，重开这个房间（机制的 resetsRoomOnDeath）
   * - room：重置当前房间；R 也是
   * - world：重置整张地图（地形、怪物、箱子、钥匙回原位，开过的门关回来）；R 也是
   */
  deathReset: 'none' | 'room' | 'world';
  /** 音乐音量 0-1 */
  musicVolume: number;
  /** 生命值：几颗心；碰到尖刺 / 怪物 / Boss 扣一颗（被压、被埋还是直接死），扣光才死 */
  playerHearts: number;
  /** 挨打后无敌多久、其中前多久人一闪一闪、一开始变红多久（毫秒） */
  hurtInvulnMs: number;
  hurtFlickerMs: number;
  hurtFlashMs: number;
  /** 挨打被弹开：横向 / 往上的速度（像素/秒），弹开期间多久不听方向键（毫秒） */
  knockbackX: number;
  knockbackY: number;
  knockbackMs: number;
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
  /** 压板也被掉下来的碎石（任何落在上面的实心地形）压下；关着时只认箱子和移动方块 */
  platePressedByRubble: boolean;
  /** 移动方块的速度（像素/秒） */
  moverSpeed: number;
  /** 移动方块撞到东西掉头前停多久（毫秒） */
  moverPauseMs: number;
  /** 钥匙门连锁：开门后传到相邻一扇同色门的间隔（毫秒）；0 = 相连的一片同时开 */
  lockChainDelayMs: number;
  /** 按 R 重置房间时，先放第四面墙特效：骷髅手攥住整个画面揉成纸团扔掉，重置好的房间淡入，再把人放下来 */
  resetCrumple: boolean;
  /** 骷髅手把玩家放进来的动画总时长（毫秒）；0 = 全都不播，直接出现 */
  respawnHandMs: number;
  /** 哪些场合由骷髅手放进来（false = 那种场合直接出现） */
  respawnHandOn: Record<AppearReason, boolean>;
  /** 迷雾开关 */
  /** 光照传播半径（格）：从玩家出发沿空气逐格衰减，实心格挡光 */
  fogRadius: number;
  /** 见过但不在视野里的格子上残留的雾浓度（0 全清晰，1 全黑） */
  fogMemoryAlpha: number;
  /** 没见过的格子的雾浓度（1 = 全黑；小一点就是很暗但隐约看得出轮廓）。迷雾区揭开前不管这个，始终全黑 */
  fogUnseenAlpha: number;
  /**
   * 画面效果开关：墙在背景上的投影、实心砖越往里越暗（体积感）、四周暗角、空气里飘的微尘、
   * 蜡烛 / 引线头周围的一小圈暖光、房顶斜照下来的光束（game/core/sceneFx.ts）
   */
  sceneFx: { shadow: boolean; depth: boolean; vignette: boolean; dust: boolean; lights: boolean; shafts: boolean };
  /** 3D 舞台（src/stage3d）：游戏画面是舞台上的一块屏幕 */
  stage3d: Stage3DConfig;
  /** 3D 世界（src/world3d）：主角跳出画面之后 */
  world3d: World3DConfig;
}

/** 长度单位是「格」（画面里一格砖那么大），速度是格 / 秒 */
export interface World3DConfig {
  /** 走路速度、起跳速度、重力（格 / 秒²）、最快下落 */
  moveSpeed: number;
  jumpVelocity: number;
  gravity: number;
  maxFall: number;
  /** 跳出画面那一下：往画面外、往上的速度 */
  popOut: { out: number; up: number };
  /** 镜头：在人身后多远、比人高多少、看向人脚上方多高；跟上的快慢（毫秒，越小跟得越紧） */
  camera: { distance: number; height: number; lookUp: number; followMs: number };
  /** 走回画面：镜头和人回到原位用多久（毫秒） */
  returnMs: number;
  /** 节奏关卡（world3d/rhythm） */
  rhythm: RhythmConfig;
}

/**
 * 节奏关卡：一条和屏幕一样宽的大道从屏幕底边铺到镜头前，各种玩法都在这上面。标了「屏幕宽」的长度是屏幕宽度的倍数。
 * 各玩法自己的手感（镜头摆哪、音符多大）在 world3d/rhythm/modes/ 各自的文件顶部
 */
export interface RhythmConfig {
  /** 主角那一排离屏幕多远、道在主角身后还延伸多远（屏幕宽） */
  heroZ: number;
  tail: number;
  /** 主角放大几倍 */
  heroScale: number;
  /** 音符提前几拍出发；从画面里飞出来的那些，在这之前先在 2D 画面里从钢琴落到画面底边，用几拍 */
  travelBeats: number;
  dropBeats: number;
  /** 要按键打的玩法：按下的时刻离拍点多少毫秒以内算 Perfect / Good，再远不算打中，过了 Good 的范围还没打算漏 */
  windows: { perfect: number; good: number };
  /** 接住整张谱的几成（0..1）才算过关：Game Master 的总血量就是音符数的这么多成 */
  passRatio: number;
  /** 主角在节奏关卡里有几滴血（HUD 上两滴一格：满格金色，剩一滴红色）；挨一下之后多久不再扣（毫秒） */
  heroHp: number;
  hurtGraceMs: number;
  /** 打完之后曲子用多久慢慢小下去（毫秒） */
  fadeOutMs: number;
  /** Game Master 的血条分几管（总血量 = 能打到他的音符数 × passRatio，平分到每一管、往上取整；接住一个掉一滴，掉光 = 够过关了） */
  bossTubes: number;
  /** 节奏关卡的曲子比平时的背景音乐响几倍（乘在 musicVolume 上，最多到满音量） */
  musicGain: number;
  /** 躲：弹幕到主角那一排的前后多少毫秒内，站在那条道上就算被打中 */
  hitWindowMs: number;
  /** 脚离地这么高（格）就跳得过横杠 */
  barClear: number;
  /** 起跳速度（格 / 秒）、重力（格 / 秒²）：决定滞空多久 */
  jumpVelocity: number;
  gravity: number;
  /** 人从画面飞到道上用多久（毫秒）；换玩法时镜头跟过去的快慢（毫秒，越小越快） */
  enterMs: number;
  cameraMs: number;
  /** 破屏到 3D 时屏幕往后倒多少度：画面里的四条道顺势接上画面外的大道 */
  screenTilt: number;
  /**
   * Game Master 在操控画面：整个画面跟着拍子动。每拍放大一下（比例）、左右晃多少度（两小节晃一个来回）；
   * 到了 3D，屏幕每拍往后点一下头（度）、左右歪多少度
   */
  sway: { zoom: number; rollDeg: number; nodDeg: number; screenRollDeg: number };
}

export interface Stage3DConfig {
  /** 相机的竖直视角（度）：越大透视越强 */
  fov: number;
  /** 画面往后倒：倒多少度、倒下去 / 扶起来各用多久（毫秒）。绕画面底边转 */
  tilt: { angle: number; ms: number };
}
