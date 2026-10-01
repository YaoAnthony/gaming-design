// ===== 移动方块：种类、能不能放、怎么分组、撞没撞（纯函数，单测直接调） =====
import type { CellRef } from '@/type';
import { Tiles } from '@/game/registry/registry';
import { Colors } from '@/game/palette';

export interface MoverKind {
  /** 地图 movers 层里的字符 */
  ch: string;
  name: string;
  desc: string;
  /** 沿哪根轴来回走 */
  axis: 'x' | 'y';
  /** 一开始往哪边走：x 轴 1 = 右，y 轴 -1 = 上 */
  startDir: 1 | -1;
  /** 编辑器里标记的颜色 */
  color: number;
}

/** 编辑器物品栏按这个顺序列出；加一种新的移动（比如斜着走）就是在这里加一行 */
export const MOVER_KINDS: MoverKind[] = [
  { ch: 'h', name: '左右移动', desc: '画在方块上：相连的一片连同底下的方块一起左右来回走，任何一格撞到东西就掉头', axis: 'x', startDir: 1, color: Colors.sky },
  { ch: 'v', name: '上下移动', desc: '画在方块上：相连的一片连同底下的方块一起上下来回走，任何一格撞到东西就掉头', axis: 'y', startDir: -1, color: 0xf15bb5 },
];

export const moverKind = (ch: string | undefined): MoverKind | undefined => MOVER_KINDS.find(k => k.ch === ch);
export const moverBrush = (k: MoverKind): string => 'mover:' + k.ch;

/** 这种砖能被移动吗：实心、自己不会往下掉。沙土、脆岩、纸这些带重力的不行 */
export function canCarry(tileId: string | undefined): boolean {
  const d = tileId === undefined ? undefined : Tiles.get(tileId);
  return !!d && d.solid && !d.canFall;
}

export interface MoverGroupSpec { kind: MoverKind; cells: CellRef[] }

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 按标记分组：上下左右相连、同一种的标记是一组（一起走）。底下的砖不能移动的格子不算（标记被忽略）。
 * @param markers 整张图的 movers 行；tiles 整张图的砖块行（同尺寸）
 */
export function buildMoverGroups(markers: string[], tiles: string[]): MoverGroupSpec[] {
  const h = markers.length, w = markers[0]?.length ?? 0;
  const ok = (x: number, y: number, ch: string) => markers[y]?.[x] === ch && canCarry(tiles[y]?.[x]);
  const seen = new Set<number>();
  const groups: MoverGroupSpec[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const kind = moverKind(markers[y][x]);
    if (!kind || seen.has(y * w + x) || !ok(x, y, kind.ch)) continue;
    const cells: CellRef[] = [];
    const st: CellRef[] = [{ x, y }]; seen.add(y * w + x);
    while (st.length) {
      const c = st.pop()!;
      cells.push(c);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(ny * w + nx) || !ok(nx, ny, kind.ch)) continue;
        seen.add(ny * w + nx); st.push({ x: nx, y: ny });
      }
    }
    groups.push({ kind, cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) });
  }
  return groups;
}

/** 这一组往 (dx, dy) 走一格会不会撞：任何一格的下一格被挡（组里自己的格子不算）就是撞了 */
export function stepBlocked(cells: CellRef[], dx: number, dy: number, blocked: (x: number, y: number) => boolean): boolean {
  const own = new Set(cells.map(c => `${c.x},${c.y}`));
  return cells.some(c => { const nx = c.x + dx, ny = c.y + dy; return !own.has(`${nx},${ny}`) && blocked(nx, ny); });
}
