// ===== 墙的拼贴：每种墙一张模板，按周围 8 格拼出每块砖的样子 =====
// 模板（asset/image/tiles/wall_*.png，仓库根目录 Aseprite asset/generators/tiles.py 生成）是几个「相位」横排，每个相位 5×3 格：
//   (0,0) 左上角  (1,0) 上边  (2,0) 右上角 | (3,0) 左上折角  (4,0) 右上折角
//   (0,1) 左边    (1,1) 中间  (2,1) 右边   | (3,1) 左下折角  (4,1) 右下折角
//   (0,2) 左下角  (1,2) 下边  (2,2) 右下角 | (3,2)、(4,2) 空着不用
// 「中间」是被同种墙团团围住的内部；「折角」是凹进去的内角：比如左上折角 = 上、左都是墙，只有左上斜角是空的。
// 每块砖分成四个角（各四分之一格）各拼各的：看这个角挨着的竖边邻居、横边邻居、斜角邻居是不是墙，
// 从模板里对应的那一格取同一个角。所以一格厚的平台、孤零零一块砖这些薄墙也拼得出来，不用另外画。
// 相位 = 这一格的列号 mod WALL_PHASES：同一个相位里每一格的内部纹理（砌缝、裂纹、沙粒）是同一张，
// 相邻的相位横着接得上，所以一大片墙是一面连续砌好的墙，4 格一循环，不是一格一格重复的小方块。只按列号算：碎块往下掉、落地都不换样子。
// 只有同一种模板的墙之间算连着（岩石和碎岩各是各的一块，交界处各画各的边，看得出哪块能炸）；地图外面也算。
// 拼法是固定的：同样的地形每次拼出来都一样，没有随机。
import type Phaser from 'phaser';
import { Tiles } from '@/game/registry/registry';

/** 8 个邻居的位 */
export const WALL_N = 1, WALL_NE = 2, WALL_E = 4, WALL_SE = 8, WALL_S = 16, WALL_SW = 32, WALL_W = 64, WALL_NW = 128;
/** 每个邻居的格子偏移和位 */
export const WALL_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, WALL_N], [1, -1, WALL_NE], [1, 0, WALL_E], [1, 1, WALL_SE],
  [0, 1, WALL_S], [-1, 1, WALL_SW], [-1, 0, WALL_W], [-1, -1, WALL_NW],
];

/** 模板里 13 格的位置（列, 行） */
export const WALL_CELLS = {
  TL: [0, 0], T: [1, 0], TR: [2, 0], iTL: [3, 0], iTR: [4, 0],
  L: [0, 1], C: [1, 1], R: [2, 1], iBL: [3, 1], iBR: [4, 1],
  BL: [0, 2], B: [1, 2], BR: [2, 2],
} as const;
export type WallCell = keyof typeof WALL_CELLS;
export const WALL_TEMPLATE_COLS = 5, WALL_TEMPLATE_ROWS = 3;

/** 拼好的墙贴图：第 k 种墙的第 p 个相位在第 k · WALL_PHASES + p 行，每行 WALL_VARIANTS.length 格；帧号 = 行 · 样子数 + 第几种 */
export const WALL_TEXTURE = 'walls';
/** 几个相位（横着几格一循环）。模板里的相位不够就从头重复用 */
export const WALL_PHASES = 4;

/** 斜角只有它两边的直边邻居都是墙时才影响样子：把没用的斜角位去掉，样子一样的掩码合成一个 */
export function normalizeWallMask(m: number): number {
  const has = (b: number) => (m & b) !== 0;
  let out = m & (WALL_N | WALL_E | WALL_S | WALL_W);
  if (has(WALL_NE) && has(WALL_N) && has(WALL_E)) out |= WALL_NE;
  if (has(WALL_SE) && has(WALL_S) && has(WALL_E)) out |= WALL_SE;
  if (has(WALL_SW) && has(WALL_S) && has(WALL_W)) out |= WALL_SW;
  if (has(WALL_NW) && has(WALL_N) && has(WALL_W)) out |= WALL_NW;
  return out;
}

/** 所有不同的样子（47 种）的规范掩码 */
export const WALL_VARIANTS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, m) => normalizeWallMask(m)))].sort((a, b) => a - b);
const VARIANT_OF = (() => {
  const t = new Uint8Array(256);
  for (let m = 0; m < 256; m++) t[m] = WALL_VARIANTS.indexOf(normalizeWallMask(m));
  return t;
})();
/** 8 邻居掩码 → 第几种样子 */
export const wallVariant = (mask: number): number => VARIANT_OF[mask & 255];

/** 一块砖的四个角（左上、右上、左下、右下）各从模板的哪一格取 */
export function wallQuarters(mask: number): [WallCell, WallCell, WallCell, WallCell] {
  const has = (b: number) => (mask & b) !== 0;
  // 一个角：挨着的竖边邻居 v、横边邻居 h、斜角邻居 d
  const pick = (v: number, h: number, d: number, corner: WallCell, hEdge: WallCell, vEdge: WallCell, inner: WallCell): WallCell => {
    if (!has(v) && !has(h)) return corner;
    if (!has(v)) return hEdge;   // 竖向那边是空的：这个角在上边 / 下边上
    if (!has(h)) return vEdge;   // 横向那边是空的：这个角在左边 / 右边上
    return has(d) ? 'C' : inner;
  };
  return [
    pick(WALL_N, WALL_W, WALL_NW, 'TL', 'T', 'L', 'iTL'),
    pick(WALL_N, WALL_E, WALL_NE, 'TR', 'T', 'R', 'iTR'),
    pick(WALL_S, WALL_W, WALL_SW, 'BL', 'B', 'L', 'iBL'),
    pick(WALL_S, WALL_E, WALL_SE, 'BR', 'B', 'R', 'iBR'),
  ];
}

/** 周围 8 格的墙掩码；connected(dx, dy) = 那个方向的邻居算不算连着的墙 */
export function wallMask(connected: (dx: number, dy: number) => boolean): number {
  let m = 0;
  for (const [dx, dy, bit] of WALL_DIRS) if (connected(dx, dy)) m |= bit;
  return m;
}

/** 墙的模板贴图 key（含松脱时换的那张），按注册顺序去重：第几个就是拼好的图里第几组行 */
export function wallTemplates(): string[] {
  return [...new Set(Tiles.filter(d => !!d.wall).flatMap(d => [d.wall!, ...(d.wallLoose ? [d.wallLoose] : [])]))];
}

/** 这一列用第几个相位 */
export const wallPhase = (x: number): number => ((x % WALL_PHASES) + WALL_PHASES) % WALL_PHASES;

/** 这种墙、这个掩码、第 x 列在拼好的图里是第几帧 */
export function wallFrame(template: string, mask: number, x = 0): number {
  return (wallTemplates().indexOf(template) * WALL_PHASES + wallPhase(x)) * WALL_VARIANTS.length + wallVariant(mask);
}

/**
 * 把各种墙的模板拼成一张图（BootScene 建一次）：第 k 种墙第 p 个相位一行，每格是一种样子（四个角各从模板取一块）。
 * 每格同时加成一帧（帧号见 wallFrame），掉落的碎块、移动方块直接用
 */
export function buildWallTexture(textures: Phaser.Textures.TextureManager, tile: number): void {
  if (textures.exists(WALL_TEXTURE)) return;
  const templates = wallTemplates(), n = WALL_VARIANTS.length, half = tile / 2;
  const tex = textures.createCanvas(WALL_TEXTURE, n * tile, Math.max(1, templates.length * WALL_PHASES) * tile)!;
  const ctx = tex.context;
  ctx.imageSmoothingEnabled = false;
  templates.forEach((key, k) => {
    const src = textures.get(key).getSourceImage() as HTMLImageElement;
    const phasesIn = Math.max(1, Math.floor(src.width / (WALL_TEMPLATE_COLS * tile)));
    for (let p = 0; p < WALL_PHASES; p++) {
      const row = k * WALL_PHASES + p, ox = (p % phasesIn) * WALL_TEMPLATE_COLS * tile;
      WALL_VARIANTS.forEach((mask, v) => {
        wallQuarters(mask).forEach((cell, q) => {
          const [cx, cy] = WALL_CELLS[cell];
          const qx = (q % 2) * half, qy = Math.floor(q / 2) * half;
          ctx.drawImage(src, ox + cx * tile + qx, cy * tile + qy, half, half, v * tile + qx, row * tile + qy, half, half);
        });
        tex.add(row * n + v, 0, v * tile, row * tile, tile, tile);
      });
    }
  });
  tex.refresh();
}
