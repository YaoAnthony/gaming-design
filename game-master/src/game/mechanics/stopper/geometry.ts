// ===== 挡块的纯计算（不碰 Phaser，单测在 tests/game/mechanics/stopper.test.ts） =====

/** 挡块立在哪：格子正中 / 这一格左边的格线上（左边是悬崖）/ 右边的格线上（右边是悬崖） */
export type StopperMount = 'center' | 'left' | 'right';

export interface StopperGround {
  /** 这一格能不能踩（实心砖、箱子都算） */
  footing(x: number, y: number): boolean;
  /** 这一格是不是实心砖（墙） */
  solid(x: number, y: number): boolean;
}

/**
 * 放在 (x, y) 这一格的挡块立在哪：脚下没东西踩 → null（失效：不挡、不画）；
 * 左右哪一边是悬崖（旁边那格是空的、它底下也是空的）就立在那一边的格线上；两边都不是（路中间）或都是（一格宽的柱子）→ 正中
 */
export function stopperMount(g: StopperGround, x: number, y: number): StopperMount | null {
  if (!g.footing(x, y + 1)) return null;
  const drop = (dx: number) => !g.solid(x + dx, y) && !g.footing(x + dx, y + 1);
  const left = drop(-1), right = drop(1);
  return left === right ? 'center' : left ? 'left' : 'right';
}

/**
 * 挡块挡怪物用的那根柱子（像素）：宽 w、高 h，底边贴着这一格的底（地面）；正中 = 格子中线上，
 * 崖边 = 在这一格里靠悬崖那边、离崖边留 inset 像素（整根连底座都站在地上，不悬在空中）
 */
export function stopperBar(mount: StopperMount, x: number, y: number, T: number, w: number, h: number, inset: number): { x: number; y: number; w: number; h: number } {
  const x0 = mount === 'center' ? x * T + (T - w) / 2 : mount === 'right' ? (x + 1) * T - inset - w : x * T + inset;
  return { x: x0, y: (y + 1) * T - h, w, h };
}

/** 一个挡块：在哪一格、立在哪（null = 失效） */
export interface StopperCell { x: number; y: number; mount: StopperMount | null }

/**
 * 箱子在第 col 列、第 row 行的那一块，往 dir 挪进隔壁那一列：会不会被挡块挡住。
 * 挡块（不管立在正中还是崖边）占着的那一格箱子进不去：推到它前面一格就停（崖边的挡块立在格子里，箱子进去会和它叠在一起）
 */
export function crossBlocked(stoppers: readonly StopperCell[], col: number, row: number, dir: -1 | 1): boolean {
  const next = col + dir;
  return stoppers.some(s => s.y === row && s.mount !== null && s.x === next);
}
