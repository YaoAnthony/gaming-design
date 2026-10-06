// ===== 调色板：游戏里反复出现的颜色都从这里拿，改一处全改 =====
// 数字形式给 Phaser（tint、fillStyle），字符串形式用 hex() 转给 DOM / 文本样式。一次性的深浅色留在用的地方。
export const Colors = {
  /** 金黄：钥匙光、提示、滑钮 */
  gold: 0xffd166,
  /** 天蓝：第 1 组钥匙门、迷雾区 1、移动方块 */
  sky: 0x4cc9f0,
  /** 玫红：危险、死亡、擦除 */
  rose: 0xef476f,
  /** 纸白：文字、帽子、纸 */
  paper: 0xf1efe6,
  /** 墨黑：背景、描边 */
  ink: 0x0b0b14,
  /** 紫：怪物、迷雾区 3 */
  violet: 0x9b5de5,
  /** 灰蓝：次要文字、轨道 */
  muted: 0x9aa0b4,
  /** 正文 */
  text: 0xe6e8f0,
  /** 面板底色 */
  panel: 0x1d2340,
  /** 奶油黄：分数、闪光 */
  cream: 0xffe8b0,
  /** 橙：迷雾区 4、橙色引线 */
  orange: 0xff9f1c,
  /** 火：引线点燃 */
  ember: 0xff7b54,
  /** 薄荷绿：选起点、成功 */
  mint: 0x80ed99,
  /** 暗灰 */
  dim: 0x5d6470,
  /** 深蓝黑：编辑器画布底 */
  deep: 0x141a2c,
  /** 暖纸白：纸的提示 */
  paperWarm: 0xf4f1e8,
  /** 淡紫：紫色引线 */
  lilac: 0xc77dff,
  /** 青绿：第 2 组钥匙门、迷雾区 2、绿色引线 */
  green: 0x06d6a0,
} as const;

/** 0xrrggbb → '#rrggbb' */
export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
