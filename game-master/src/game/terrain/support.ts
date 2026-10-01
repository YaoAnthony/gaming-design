// ===== 支撑检测的纯函数：什么被撑住、什么会掉、挂着的砖什么时候碎（编辑器和单元测试也用）=====
import type { CellRef, MountSide } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { NEIGHBORS } from './blast';

/**
 * 挂着的砖（mounted）现在挂在哪：下面是实心就挂下面（默认，木板上也行）；下面空了，能挂旁边的（sideMount）看左右：
 * 左边是墙挂左边、右边是墙挂右边、两边都是墙挂两边（木板不算墙）。一边都挂不上 = null（该碎了）
 */
export function mountSide(grid: string[][], x: number, y: number): MountSide | null {
  const solid = (cx: number, cy: number) => !!Tiles.get(grid[cy]?.[cx])?.solid;
  if (solid(x, y + 1)) return 'down';
  if (!Tiles.get(grid[y]?.[x])?.sideMount) return null;
  const wall = (cx: number) => { const d = Tiles.get(grid[y]?.[cx]); return !!d?.solid && !d.oneWay; };   // 木板只有顶上一条，侧面挂不住
  const left = wall(x - 1), right = wall(x + 1);
  return left && right ? 'both' : left ? 'left' : right ? 'right' : null;
}

/** 刚被清空的格子挂得住的方向：它上面那格挂在它上面（下），右边那格挂在它上面（左），左边那格挂在它上面（右） */
const HOLDS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [-1, 0]];

/** 这些格子刚被清空，挨着它们的挂着的砖（mounted）里，已经哪边都挂不住的那些 */
export function findUnmounted(grid: string[][], cleared: CellRef[]): CellRef[] {
  const out: CellRef[] = [];
  const seen = new Set<string>();
  cleared.forEach(c => {
    for (const [dx, dy] of HOLDS) {
      const x = c.x + dx, y = c.y + dy;
      if (y < 0 || seen.has(`${x},${y}`)) continue;
      if (!Tiles.get(grid[y]?.[x])?.mounted) continue;
      if (mountSide(grid, x, y)) continue;   // 还有地方挂（比如同一格马上又被填上、或者旁边有墙）
      seen.add(`${x},${y}`);
      out.push({ x, y });
    }
  });
  return out;
}

/**
 * 从所有锚点出发 4 邻域漫延，返回"被撑住"标记数组。
 * @param restsOn 额外的锚点：这一格下面有东西托着（比如箱子），它自己是实心的就算锚点
 */
export function computeSupport(grid: string[][], restsOn?: (x: number, y: number) => boolean): Uint8Array {
  const h = grid.length, w = grid[0].length;
  const seen = new Uint8Array(w * h);
  const stack: [number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const def = Tiles.get(grid[y][x]);
      if (def?.anchor || (def?.solid && restsOn?.(x, y))) { seen[y * w + x] = 1; stack.push([x, y]); }
    }
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen[ny * w + nx] || !Tiles.get(grid[ny][nx])?.solid) continue;
      seen[ny * w + nx] = 1; stack.push([nx, ny]);
    }
  }
  return seen;
}

/** 整张地图里一开始就会掉落的格子 */
export function findUnsupported(rows: string[]): CellRef[] {
  const grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
  const seen = computeSupport(grid);
  const w = grid[0].length;
  const out: CellRef[] = [];
  grid.forEach((row, y) => row.forEach((c, x) => { if (Tiles.get(c)?.canFall && !seen[y * w + x]) out.push({ x, y }); }));
  return out;
}

/** 没被撑住的可掉落格子按连通块分组（每组会变成一块碎块） */
export function unsupportedGroups(grid: string[][], seen: Uint8Array): CellRef[][] {
  const h = grid.length, w = grid[0].length;
  const idx = (x: number, y: number) => y * w + x;
  const grouped = new Uint8Array(w * h);
  const groups: CellRef[][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!Tiles.get(grid[y][x])?.canFall || seen[idx(x, y)] || grouped[idx(x, y)]) continue;
      const cells: CellRef[] = [];
      const st: [number, number][] = [[x, y]];
      grouped[idx(x, y)] = 1;
      while (st.length) {
        const [px, py] = st.pop()!;
        cells.push({ x: px, y: py });
        for (const [dx, dy] of NEIGHBORS) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (grouped[idx(nx, ny)] || seen[idx(nx, ny)] || !Tiles.get(grid[ny][nx])?.canFall) continue;
          grouped[idx(nx, ny)] = 1; st.push([nx, ny]);
        }
      }
      groups.push(cells);
    }
  return groups;
}
