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

/**
 * Game Master 的木手（3D asset/gm_hand 的模型，stage3d/hand 画）：每种材质从亮到暗的几档颜色，stops 是每档的明暗下限（长度 = 颜色数 - 1）。
 * 材质名和 glb 里的一致。木头和护腕的最后一档是凹槽里的颜色
 */
export const GM_HAND_PALETTE: Record<string, { colors: string[]; stops: number[] }> = {
  wood: { colors: ['#d6c4a2', '#b8a688', '#9c8c74', '#776a5a', '#4d453c'], stops: [0.84, 0.55, 0.25, 0.11] },   // 手指、手掌、前臂
  cuff: { colors: ['#d2bf9e', '#b09e80', '#978770', '#786b5b', '#4d453c'], stops: [0.84, 0.55, 0.25, 0.11] },   // 护腕
  wrist: { colors: ['#625e55', '#524f47', '#45433d', '#383631'], stops: [0.82, 0.52, 0.24] },                   // 手腕、前臂的关节
  knot: { colors: ['#5e5447', '#51483d'], stops: [0.4] },                                                       // 指节之间的暗缝
  frame: { colors: ['#6b6254'], stops: [] },                                                                    // 护腕上的方框
  boss: { colors: ['#958470'], stops: [] },                                                                     // 方框中间的小方块
};
