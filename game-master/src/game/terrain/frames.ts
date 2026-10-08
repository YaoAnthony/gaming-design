// ===== 一格砖用哪张贴图的哪一帧（纯函数：编辑器、碎块、移动方块都用）=====
import { AIR, Tiles } from '@/game/registry/registry';
import { WALL_TEXTURE, wallFrame, wallMask } from './walls';
import { mountSide } from './support';

/** tilemap 里墙那套贴图（拼好的 walls）的第一个编号：墙砖的格子编号 = WALL_GID + wallFrame */
export const WALL_GID = 1000;

export type TileView = 'game' | 'editor';

/** 不看邻居的默认帧（碎块等用）；游戏视角优先用 gameFrame */
export function frameOf(id: string, view: TileView = 'game'): number {
  const d = Tiles.get(id);
  if (!d) return -1;
  return view === 'game' ? d.gameFrame : d.frame;
}

/** 四周同类格子的位掩码：上=1 右=2 下=4 左=8 */
export function maskAt(grid: string[][], x: number, y: number): number {
  const id = grid[y]?.[x];
  let m = 0;
  if (grid[y - 1]?.[x] === id) m |= 1;
  if (grid[y]?.[x + 1] === id) m |= 2;
  if (grid[y + 1]?.[x] === id) m |= 4;
  if (grid[y]?.[x - 1] === id) m |= 8;
  return m;
}

/**
 * 拼墙时这一格算不算连着的墙：group 给了 = 同一组的墙才算（TileDef.wallGroup：岩石和碎岩是一组，脆岩、沙土各是各的），
 * 不给 = 任何墙都算；地图外面也算（地图边上的墙朝外那面不画表面）
 */
export function isWallAt(grid: string[][], x: number, y: number, group?: string | null): boolean {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return true;
  const g = Tiles.get(grid[y][x])?.wallGroup;
  return group ? g === group : !!g;
}

/**
 * 看邻居选帧：游戏里的墙按周围 8 格从拼好的墙贴图里取（WALL_GID + wallFrame，相位按列号）；自动拼贴的材质用 起始帧 + 掩码；
 * 能改挂在旁边的（尖刺）按 mountSide 取那种挂法的帧；
 * 其它材质就是起始帧。游戏视角用 gameFrame，编辑器用 frame（编辑器里墙也整块画）。
 * isWall(x, y, group) = 那一格算不算连着的、同一组的墙，默认见 isWallAt
 */
export function frameAt(grid: string[][], x: number, y: number, view: TileView = 'game', isWall?: (x: number, y: number, group: string) => boolean): number {
  const id = grid[y]?.[x];
  const d = id != null ? Tiles.get(id) : undefined;
  if (!d) return -1;
  if (view === 'game' && d.wall) {
    const group = d.wallGroup ?? d.wall;
    const at = isWall ?? ((wx: number, wy: number, g: string) => isWallAt(grid, wx, wy, g));
    return WALL_GID + wallFrame(d.wall, wallMask((dx, dy) => at(x + dx, y + dy, group)), x);
  }
  if (d.sideMount) {   // 改挂在旁边的（尖刺）：按挂法换帧，编辑器里也一样
    const side = mountSide(grid, x, y);
    if (side && side !== 'down') return d.sideMount.frames[side];
  }
  const base = view === 'game' ? d.gameFrame : d.frame;
  if (base < 0) return -1;
  return d.autotile ? base + maskAt(grid, x, y) : base;
}

/**
 * 单独画的一块砖（掉落的碎块、移动方块）用什么贴图和帧：墙按 connected（它那一组里哪些方向的邻居是同一组的墙）拼，相位按 x（第几列），
 * loose = 正在往下掉（松脱了：脆岩换成没有螺栓的那张）；其它整块画
 */
export function pieceTexture(id: string, connected: (dx: number, dy: number) => boolean, x = 0, loose = false): [string, number] {
  const d = Tiles.get(id);
  if (d?.wall) return [WALL_TEXTURE, wallFrame((loose && d.wallLoose) || d.wall, wallMask(connected), x)];
  return ['tiles', frameOf(id)];
}

/** 一块碎块自己里面哪些邻居是同一组的墙（它是单独掉下来的一整块，墙按块内拼） */
export function pieceConnected(cells: { x: number; y: number; id: string }[]): (c: { x: number; y: number; id: string }) => (dx: number, dy: number) => boolean {
  const ids = new Map(cells.map(c => [`${c.x},${c.y}`, c.id]));
  return c => {
    const group = Tiles.get(c.id)?.wallGroup;
    return (dx, dy) => !!group && Tiles.get(ids.get(`${c.x + dx},${c.y + dy}`) ?? AIR)?.wallGroup === group;
  };
}
