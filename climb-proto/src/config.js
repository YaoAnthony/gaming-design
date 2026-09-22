// ===== 手感与规则参数（全部在这里调）=====
const CFG = {
  TILE: 32,                 // 格子大小（像素）
  viewW: 640,               // 视口宽 = 20 格
  viewH: 640,               // 视口高 = 20 格

  gravity: 1200,
  moveSpeed: 230,
  jumpVelocity: -560,       // 地面起跳竖直速度（约 4 格高）
  wallJumpX: 260,           // 蹬墙跳水平速度
  wallJumpY: -560,
  wallSlideMaxFall: 120,    // 贴墙时最大下落速度（滑墙）
  wallJumpLockMs: 160,      // 蹬墙跳后短暂锁定水平输入，避免被立刻抵消
  coyoteMs: 90,
  jumpBufferMs: 100,

  // 爆炸：以格子为单位的圆形模板。1.5 → 3x3；2.0 → 3x3 + 上下左右各一格
  explosionRadius: 1.5,

  // 断裂碎块下落
  chunkGravity: 1400,
  chunkMaxFall: 700,
  crushMinSpeed: 250,       // 碎块下落速度超过这个值才会压死人/压死怪；更慢时只是把人顶开

  enemySpeed: 60,           // 怪物巡逻速度
  roomPanMs: 180,           // 切换房间时相机平移时间

  // 材质字符 → 类型
  // '.' 空气  '#' 泥土(可炸)  'R' 岩石(炸不动、锚点)  'B' 脆岩(被波及即整段崩塌)
  // 'P' 出生点  'C' 存档点  'G' 终点
};
