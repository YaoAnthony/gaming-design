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

/** 卡通分档材质用的调色板（stage3d/hand/ToonPaletteMaterial）：材质名 → 从亮到暗的几档颜色 + 每档的明暗下限 */
export type ToonPalettes = Record<string, { colors: string[]; stops: number[] }>;
const bands = (colors: string[]): { colors: string[]; stops: number[] } => ({ colors, stops: [[], [], [0.5], [0.7, 0.35], [0.78, 0.5, 0.25], [0.84, 0.55, 0.25, 0.11]][colors.length] ?? [] });

/** 主角的 3D 模型（3D asset/hero，颜色取自 player_sheet.png） */
export const HERO_PALETTE: ToonPalettes = {
  hero_head: bands(['#ddcbac', '#b8a687', '#9c8468']),
  hero_panel: bands(['#4a4e4f', '#3f4344', '#313536']),
  hero_visor: bands(['#222325']),
  hero_vest: bands(['#62564c', '#4a423b', '#292828']),
  hero_stripe: bands(['#74665a', '#62564c', '#4a423b']),
  hero_pad: bands(['#c0805c', '#a56b4f', '#7f5039']),
  hero_arm: bands(['#777b6d', '#5d6155', '#454840']),
  hero_leg: bands(['#bca280', '#9c8468', '#74665a']),
  hero_boot: bands(['#62a695', '#4a7f72', '#3c5f57']),
};

/** 夹子桑的 3D 模型（3D asset/clip，颜色取自 clip_sheet.png） */
export const CLIP_PALETTE: ToonPalettes = {
  clip_wood: bands(['#dd8a5b', '#c0703f', '#a35a31', '#7d4426']),
  clip_ring: bands(['#efe6d0', '#d9cfb6', '#bdb29a']),
  clip_core: bands(['#2a2826', '#1b1a19']),
  clip_leg: bands(['#3a332f', '#2e2724', '#221d1b']),
  clip_foot: bands(['#4a403b', '#3a332f']),
  clip_tongue: bands(['#8a2320', '#561512']),
};

/** Game Master 本体的 3D 模型（3D asset/boss）：木头和木手一样，围裙那些另配 */
export const BOSS_PALETTE: ToonPalettes = {
  ...GM_HAND_PALETTE,
  plate: bands(['#e2d8c0', '#c9bda2', '#a89c84', '#7f7462']),   // 胸甲：奶白，比木头亮一档
  apron: bands(['#6b7a5c', '#55624a', '#46523e', '#343c30']),
  strap: bands(['#55624a', '#46523e', '#343c30']),
  pocket: bands(['#c4ad84', '#a8926a', '#85714f']),
  tag: bands(['#e0c468', '#c4a74c', '#96803a']),
  string: bands(['#b09e80', '#978770']),
  socket: bands(['#3a342e', '#262220', '#161412']),
  slit: bands(['#3a342e', '#262220']),
  buckle: bands(['#c4ad84', '#a8926a']),
};

/** 3D 世界的场景件（3D asset/props：木框、桌面、木箱、木板、吊灯），和 build_props.py 的 PALETTE 一致 */
export const PROPS_PALETTE: ToonPalettes = {
  frame: bands(['#b9805f', '#9a6648', '#754b35']),
  corner: bands(['#8f5a44', '#73483a', '#55342a']),
  nail: bands(['#4a4440', '#2e2a28']),
  deck: bands(['#4c6a63', '#3d5651', '#2d403c']),
  lip: bands(['#5f7d75', '#4c6a63', '#3d5651']),
  leg: bands(['#8a7355', '#6d5a43', '#4f4131']),
  crate: bands(['#cfae80', '#b7956a', '#8f734f']),
  crate_edge: bands(['#9a7b55', '#7f6344', '#5c4731']),
  crate_dark: bands(['#3a2f24', '#241d17']),
  plank: bands(['#c7a678', '#a98a5e', '#806744']),
  lamp_shade: bands(['#5d6a5e', '#434d44', '#2d342e']),
  lamp_inner: bands(['#f1e6c8', '#d9ccaa']),
  lamp_cord: bands(['#2a2826', '#1b1a19']),
  lamp_bulb: bands(['#fff3d0']),
  spool: bands(['#d8b98c', '#c9a97c', '#a0865e']),
  thread: bands(['#b8403a', '#8f2f2b', '#5e1f1c']),
  steel: bands(['#b9c0c6', '#8f979e', '#5f666c']),
  handle: bands(['#3a3634', '#262322', '#161413']),
  glass: bands(['#b9cfd0', '#8fb0b2', '#5f8587']),
  lid: bands(['#8a7355', '#6d5a43', '#4f4131']),
  pin_red: bands(['#d64b3f', '#a3362e']),
  pin_blue: bands(['#3f7fd6', '#2e5ea3']),
  pin_yellow: bands(['#e3c04a', '#b09234']),
  shaving: bands(['#ecd7ad', '#d8bd8c', '#b29a6c']),
};
