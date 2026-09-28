// ===== 引线的颜色（通道）=====
// 每种颜色是一张独立的引线网：只和同色的邻居相连，只点得着同色的端点，烧起来也只沿同色走。
// 不同颜色可以画在同一格（交叉），交叉点互不连通、互不引爆。游戏里的引线头默认都长一样；
// 设了 node 的颜色（紫色）引线头更大、带特效。
//
// 地图里引线层每一格是一个字符，表示这一格有哪些颜色（位掩码，第 n 位 = n 号颜色）：
//   '.' = 没有；'W' = 只有 0 号（老地图的写法，0 号单独时也继续这么写，老地图一字不变）；
//   其余是十六进制 '2'-'f'（'1' 读得懂，但写出来是 'W'）。
// 存档里同一套掩码写成一位十六进制 '0'-'f'（老存档的 '0' / '1' 正好兼容）。

export interface FuseChannelDef {
  id: number;
  name: string;
  /** 编辑器里画这个颜色用的颜色 */
  color: number;
  /** 烧起来更猛：会裂的砖（岩石）不裂成碎岩，直接烧没 */
  shatter?: boolean;
  /** 游戏里引线头的样子。不写 = 普通的小黄点（看不出是什么颜色）；
   *  写了 = 放大 scale 倍、一直一胀一缩，外面一圈 glow 色的光晕，往上冒同色的火星 */
  node?: { scale: number; glow: number };
}

export const FUSE_CHANNELS: readonly FuseChannelDef[] = [
  { id: 0, name: '橙', color: 0xff7b54 },
  { id: 1, name: '蓝', color: 0x4cc9f0 },
  { id: 2, name: '绿', color: 0x80ed99 },
  { id: 3, name: '紫', color: 0xc77dff, shatter: true, node: { scale: 1.8, glow: 0xc77dff } },
];

/** 所有颜色的位都置上 */
export const FUSE_ALL = (1 << FUSE_CHANNELS.length) - 1;

export const fuseBit = (ch: number): number => 1 << ch;

/** 地图 / 存档的一格 → 位掩码；不认识的字符当没有 */
export function decodeFuse(c: string | undefined): number {
  if (!c || c === '.') return 0;
  if (c === 'W') return 1;
  const n = parseInt(c, 16);
  return Number.isNaN(n) ? 0 : n & FUSE_ALL;
}

/** 位掩码 → 地图里的一格 */
export function encodeFuse(mask: number): string {
  const m = mask & FUSE_ALL;
  return m === 0 ? '.' : m === 1 ? 'W' : m.toString(16);
}

/** 位掩码 → 存档里的一格（一位十六进制） */
export const encodeFuseState = (mask: number): string => (mask & FUSE_ALL).toString(16);

/** 这一格有没有这个颜色 */
export const fuseHas = (c: string | undefined, ch: number): boolean => (decodeFuse(c) & fuseBit(ch)) !== 0;
