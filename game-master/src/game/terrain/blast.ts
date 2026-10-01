// ===== 爆炸、连锁、烧毁、松脱的纯函数（不碰 Phaser，单测直接调）=====
// 所有"这个格子能不能炸 / 会不会掉"都问注册表（Tiles），这里不认识具体砖块字符。
import type { CellRef, TileDef } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';

export const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface BlastCell extends CellRef { d: number }
export interface RemovedCell extends CellRef { id: string; def: TileDef; /** 连锁传导的跳数：0 = 直接命中，n = 沿链条传导了 n 格 */ hop?: number }

/** 圆形模板内的格子，附带到中心的距离 */
export function blastCells(cx: number, cy: number, radius: number): BlastCell[] {
  const out: BlastCell[] = [];
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) out.push({ x: cx + dx, y: cy + dy, d });
    }
  return out;
}

/** 链条端点：同类 4 邻居 ≤ 1 个（孤立的一格既是头也是尾） */
export function isChainEnd(grid: string[][], x: number, y: number): boolean {
  const id = grid[y]?.[x];
  if (id == null) return false;
  let n = 0;
  for (const [dx, dy] of NEIGHBORS) if (grid[y + dy]?.[x + dx] === id) n++;
  return n <= 1;
}

/**
 * 给定网格和种子，算出连锁会摧毁哪些格子，按 BFS 记录每格的传导跳数（hop = 离最近种子的距离）。
 * 只沿"和种子同一个 id"的相邻格子扩散——这就是"导火索只烧导火索、不会连累旁边其它材质"的全部保证，不需要额外特判。
 */
export function computeChain(grid: string[][], seeds: RemovedCell[]): RemovedCell[] {
  const h = grid.length, w = grid[0]?.length ?? 0;
  const seen = new Map<string, number>();
  const out: RemovedCell[] = [];
  const queue: RemovedCell[] = [];
  seeds.forEach(s => {
    const k = `${s.x},${s.y}`;
    if (seen.has(k)) return;
    seen.set(k, 0);
    const withHop: RemovedCell = { ...s, hop: 0 };
    out.push(withHop);
    if (s.def.chainCollapse) queue.push(withHop);
  });
  let qi = 0;
  while (qi < queue.length) {
    const c = queue[qi++];
    const hop = (c.hop ?? 0) + 1;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny][nx] !== c.id) continue;
      seen.set(k, hop);
      const n: RemovedCell = { x: nx, y: ny, id: c.id, def: c.def, hop };
      out.push(n); queue.push(n);
    }
  }
  return out;
}

/** 引线烧到一格之后它变成什么：会裂的（岩石）变成裂开的砖，其它实心的烧没，空气 / 不实心的不变。shatter = 猛火（紫色引线），会裂的也直接烧没 */
export function burnedTo(id: string, shatter = false): string {
  const d = Tiles.get(id);
  if (!d || !d.solid || d.fireproof) return id;
  return shatter ? AIR : d.crackTo ?? AIR;
}

/** 距任一中心 ≤ radius + 材质感应距离 的"会松脱"格子，按相连同类分组 */
export function findLooseGroups(grid: string[][], centers: CellRef[], radius: number): CellRef[][] {
  // 每帧的起跳预览都会调：只看爆炸附近的种子和从它们连出去的格子，不扫整张地图
  const h = grid.length, w = grid[0]?.length ?? 0;
  const seeds = new Set<number>();
  const maxBonus = Tiles.list().reduce((m, d) => (d.looseOnBlast ? Math.max(m, d.blastSensitivity) : m), 0);
  const r = Math.ceil(radius + maxBonus);
  centers.forEach(c => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const def = Tiles.get(grid[y][x]);
      if (!def?.looseOnBlast) continue;
      if (Math.sqrt(dx * dx + dy * dy) <= radius + def.blastSensitivity) seeds.add(y * w + x);
    }
  });
  const seen = new Set<number>();
  const groups: CellRef[][] = [];
  for (const i of [...seeds].sort((a, b) => a - b)) {   // 按行优先的顺序出组，结果稳定
    if (seen.has(i)) continue;
    const x = i % w, y = (i - x) / w;
    const id = grid[y][x];
    const group: CellRef[] = []; const st: [number, number][] = [[x, y]]; seen.add(i);
    while (st.length) {
      const [px, py] = st.pop()!;
      group.push({ x: px, y: py });
      for (const [dx, dy] of NEIGHBORS) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen.has(ni) || grid[ny][nx] !== id) continue;
        seen.add(ni); st.push([nx, ny]);
      }
    }
    groups.push(group);
  }
  return groups;
}
