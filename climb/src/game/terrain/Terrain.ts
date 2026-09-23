// ===== 格子地形：爆炸破坏、支撑检测、失去支撑的地块整体下落 =====
// 所有"这个格子能不能炸 / 会不会掉 / 挡不挡人"都问注册表（Tiles），这里不认识具体砖块字符。
import type Phaser from 'phaser';
import type { CellRef, TileDef } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { AUTOTILE_VARIANTS } from '@/asset';

export type TileView = 'game' | 'editor';

export interface BlastCell extends CellRef { d: number }
export interface RemovedCell extends CellRef { id: string; def: TileDef; /** 连锁传导的跳数：0 = 直接命中，n = 沿链条传导了 n 格 */ hop?: number }
export interface ChunkCell extends CellRef { id: string }
export interface Chunk { id: number; cells: ChunkCell[]; container: Phaser.GameObjects.Container; vy: number; py: number; /** >0 = 匀速飘落 */ floatSpeed: number; t: number }

export interface TerrainOptions { tile: number; explosionRadius: number; chunkGravity: number; chunkMaxFall: number }

/** 场景需要提供给地形的最小接口 */
export interface TerrainHost {
  scene: Phaser.Scene;
  onChunkFall?(chunk: Chunk): void;
  onChunkLand?(chunk: Chunk): void;
  /** 带 chainDelayMs 的连锁（比如导火索）每摧毁一跳就调用一次，用来播传导中的特效 */
  onFuseBurn?(cells: ChunkCell[]): void;
  /** 飘落的碎块每帧问一次：有没有人把它接住（比如落到怪物头上）。返回 true 表示接管了它 */
  catchChunk?(chunk: Chunk): boolean;
}

export class Terrain {
  readonly w: number;
  readonly h: number;
  readonly T: number;
  readonly grid: string[][];
  readonly original: string[][];
  readonly chunks: Chunk[] = [];
  private nextChunkId = 1;
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly boundaryId: string;

  constructor(private readonly host: TerrainHost, rows: string[], private opts: TerrainOptions) {
    this.T = opts.tile;
    this.w = rows[0].length;
    this.h = rows.length;
    this.grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
    this.original = this.grid.map(r => r.slice());
    this.boundaryId = (Tiles.filter(d => d.anchor)[0] ?? { id: AIR }).id;

    const data = this.grid.map((r, y) => r.map((_, x) => Terrain.frameAt(this.grid, x, y)));
    this.map = host.scene.make.tilemap({ data, tileWidth: this.T, tileHeight: this.T });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', this.T, this.T, 0, 0)!;
    this.layer = this.map.createLayer(0, tileset, 0, 0)!;
    const collide: number[] = [];
    Tiles.filter(d => d.solid && d.gameFrame >= 0).forEach(d => { for (let k = 0; k < (d.autotile ? AUTOTILE_VARIANTS : 1); k++) collide.push(d.gameFrame + k); });
    this.layer.setCollision(collide);
  }

  setOptions(opts: Partial<TerrainOptions>): void { this.opts = { ...this.opts, ...opts }; }

  /** 不看邻居的默认帧（碎块等用）；游戏视角优先用 gameFrame */
  static frameOf(id: string, view: TileView = 'game'): number {
    const d = Tiles.get(id);
    if (!d) return -1;
    return view === 'game' ? d.gameFrame : d.frame;
  }

  /** 四周同类格子的位掩码：上=1 右=2 下=4 左=8 */
  static maskAt(grid: string[][], x: number, y: number): number {
    const id = grid[y]?.[x];
    let m = 0;
    if (grid[y - 1]?.[x] === id) m |= 1;
    if (grid[y]?.[x + 1] === id) m |= 2;
    if (grid[y + 1]?.[x] === id) m |= 4;
    if (grid[y]?.[x - 1] === id) m |= 8;
    return m;
  }

  /** 看邻居选帧：自动拼贴的材质用 起始帧 + 掩码，其它材质就是起始帧。游戏视角用 gameFrame，编辑器用 frame */
  static frameAt(grid: string[][], x: number, y: number, view: TileView = 'game'): number {
    const id = grid[y]?.[x];
    const d = id != null ? Tiles.get(id) : undefined;
    if (!d) return -1;
    const base = view === 'game' ? d.gameFrame : d.frame;
    if (base < 0) return -1;
    return d.autotile ? base + Terrain.maskAt(grid, x, y) : base;
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.boundaryId;
    return this.grid[y][x];
  }
  def(x: number, y: number): TileDef { return Tiles.get(this.get(x, y)) ?? Tiles.get(AIR)!; }
  isSolid(x: number, y: number): boolean { return this.def(x, y).solid; }
  rows(): string[] { return this.grid.map(r => r.join('')); }

  set(x: number, y: number, id: string): void {
    this.grid[y][x] = id;
    this.refreshFrame(x, y);
    // 自动拼贴的邻居要跟着换图案
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (Tiles.get(this.grid[ny][nx])?.autotile) this.refreshFrame(nx, ny);
    }
  }

  private refreshFrame(x: number, y: number): void {
    const f = Terrain.frameAt(this.grid, x, y);
    if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
  }

  /** 圆形模板内的格子，附带到中心的距离 */
  blastCells(cx: number, cy: number, radius: number): BlastCell[] {
    const out: BlastCell[] = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= radius) out.push({ x: cx + dx, y: cy + dy, d });
      }
    return out;
  }

  /** 这个格子现在能不能被爆炸直接命中（可炸，且如果是"只点两端"的材质，必须是链条端点） */
  canIgnite(x: number, y: number): boolean {
    const def = this.def(x, y);
    if (!def.destructible) return false;
    if (def.igniteAtEndsOnly && !Terrain.isChainEnd(this.grid, x, y)) return false;
    return true;
  }

  /** 链条端点：同类 4 邻居 ≤ 1 个（孤立的一格既是头也是尾） */
  static isChainEnd(grid: string[][], x: number, y: number): boolean {
    const id = grid[y]?.[x];
    if (id == null) return false;
    let n = 0;
    for (const [dx, dy] of NEIGHBORS) if (grid[y + dy]?.[x + dx] === id) n++;
    return n <= 1;
  }

  /** 圆形爆炸预览：返回会被摧毁的格子（脆岩多一圈感应，含连锁） */
  previewExplosion(cx: number, cy: number, radius = this.opts.explosionRadius): RemovedCell[] {
    const R = radius;
    const maxBonus = Math.max(0, ...Tiles.list().map(d => d.blastSensitivity));
    const seeds: RemovedCell[] = [];
    this.blastCells(cx, cy, R + maxBonus).forEach(c => {
      if (!this.canIgnite(c.x, c.y)) return;
      const def = this.def(c.x, c.y);
      if (c.d <= R + def.blastSensitivity) seeds.push({ x: c.x, y: c.y, id: def.id, def });
    });
    return this.chain(seeds);
  }

  /** 任意模板预览：模板内可炸的格子（含连锁；不做感应范围扩展） */
  previewCells(cells: CellRef[]): RemovedCell[] {
    const seeds: RemovedCell[] = [];
    cells.forEach(c => { if (this.canIgnite(c.x, c.y)) { const def = this.def(c.x, c.y); seeds.push({ x: c.x, y: c.y, id: def.id, def }); } });
    return this.chain(seeds);
  }

  /** 连锁：从会连锁的种子出发，沿同类格子 4 邻域扩散 */
  private chain(seeds: RemovedCell[]): RemovedCell[] { return Terrain.computeChain(this.grid, seeds); }

  /**
   * 纯函数版本（不需要 Phaser 场景，单测直接调）：给定网格和种子，算出连锁会摧毁哪些格子，
   * 按 BFS 记录每格的传导跳数（hop = 离最近种子的距离）。只沿"和种子同一个 id"的相邻格子
   * 扩散——这就是"导火索只烧导火索、不会连累旁边其它材质"的全部保证，不需要额外特判。
   */
  static computeChain(grid: string[][], seeds: RemovedCell[]): RemovedCell[] {
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

  /** 执行圆形爆炸，返回被摧毁的格子（用于特效） */
  explode(cx: number, cy: number, radius = this.opts.explosionRadius): RemovedCell[] {
    return this.destroyCells(this.previewExplosion(cx, cy, radius));
  }

  /**
   * 摧毁给定格子（只处理在地图内、当前可炸的），然后做支撑检测。
   * 格子如果带 hop（来自 previewExplosion / previewCells 的连锁结果）且材质设了
   * chainDelayMs（比如导火索），会按 hop * chainDelayMs 错峰摧毁，做出"火苗沿链条
   * 跑过去"的效果；没有 hop 或延迟为 0 的格子照旧瞬间摧毁。返回值仍是完整命中列表，
   * 摧毁计分 / 起爆特效可以立即用，视觉上的传导只是地形本身随后才跟上。
   */
  destroyCells(cells: CellRef[]): RemovedCell[] {
    const removed: RemovedCell[] = [];
    const immediate: RemovedCell[] = [];
    const delayed = new Map<number, RemovedCell[]>();
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y);
      const hop = (c as Partial<RemovedCell>).hop ?? 0;
      if (hop === 0 ? !this.canIgnite(c.x, c.y) : !def.destructible) return;
      const r: RemovedCell = { x: c.x, y: c.y, id: def.id, def, hop };
      removed.push(r);
      if (def.chainDelayMs > 0 && hop > 0) { const arr = delayed.get(hop) ?? []; arr.push(r); delayed.set(hop, arr); }
      else immediate.push(r);
    });
    immediate.forEach(c => this.set(c.x, c.y, AIR));
    if (immediate.length) { this.resolveSupport(); this.shake(immediate, 0); }
    [...delayed.entries()].sort((a, b) => a[0] - b[0]).forEach(([hop, group]) => {
      const delayMs = hop * group[0].def.chainDelayMs;
      this.host.scene.time.delayedCall(delayMs, () => {
        group.forEach(c => this.set(c.x, c.y, AIR));
        this.resolveSupport();
        this.shake(group, 0);
        this.host.onFuseBurn?.(group);
      });
    });
    return removed;
  }

  // ---- 松脱（脆岩）----
  /** 纯函数：距任一中心 ≤ radius + 材质感应距离 的"会松脱"格子，按相连同类分组 */
  static findLooseGroups(grid: string[][], centers: CellRef[], radius: number): CellRef[][] {
    const h = grid.length, w = grid[0]?.length ?? 0;
    const seed = new Uint8Array(w * h);
    const maxBonus = Math.max(0, ...Tiles.list().filter(d => d.looseOnBlast).map(d => d.blastSensitivity));
    const r = Math.ceil(radius + maxBonus);
    centers.forEach(c => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const def = Tiles.get(grid[y][x]);
        if (!def?.looseOnBlast) continue;
        if (Math.sqrt(dx * dx + dy * dy) <= radius + def.blastSensitivity) seed[y * w + x] = 1;
      }
    });
    const seen = new Uint8Array(w * h);
    const groups: CellRef[][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!seed[i] || seen[i]) continue;
      const id = grid[y][x];
      const group: CellRef[] = []; const st: [number, number][] = [[x, y]]; seen[i] = 1;
      while (st.length) {
        const [px, py] = st.pop()!;
        group.push({ x: px, y: py });
        for (const [dx, dy] of NEIGHBORS) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || grid[ny][nx] !== id) continue;
          seen[ni] = 1; st.push([nx, ny]);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  /** 预览：会松脱并真正掉下去的格子 */
  previewLoose(centers: CellRef[], radius: number): CellRef[] {
    return Terrain.findLooseGroups(this.grid, centers, radius).filter(g => this.canGroupFall(g)).flat();
  }

  /** 一组格子作为整体能不能往下掉：每一格的正下方要么是空的，要么还是这组自己的格子 */
  canGroupFall(group: CellRef[]): boolean {
    const inGroup = new Set(group.map(c => `${c.x},${c.y}`));
    return group.every(c => inGroup.has(`${c.x},${c.y + 1}`) || !this.isSolid(c.x, c.y + 1));
  }

  /** 震动：centers 周围会松脱的材质整块变成碎块掉下来。已经坐在实地上、掉不下去的不理会（不出特效）。返回松脱的格子数 */
  shake(centers: CellRef[], radius: number): number {
    const groups = Terrain.findLooseGroups(this.grid, centers, radius).filter(g => this.canGroupFall(g));
    groups.forEach(g => this.spawnChunk(g.map(c => ({ x: c.x, y: c.y, id: this.grid[c.y][c.x] }))));
    if (groups.length) this.resolveSupport();
    return groups.reduce((n, g) => n + g.length, 0);
  }

  /** 无条件摧毁（引线用）：不管可不可炸、是不是岩石，实心的就炸掉，然后做支撑检测 */
  destroyCellsForce(cells: CellRef[]): RemovedCell[] {
    const removed: RemovedCell[] = [];
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y);
      if (!def.solid) return;
      removed.push({ x: c.x, y: c.y, id: def.id, def, hop: 0 });
      this.set(c.x, c.y, AIR);
    });
    if (removed.length) this.resolveSupport();
    return removed;
  }

  // ---- 支撑检测（纯函数，编辑器和单元测试也用）----
  /** 从所有锚点出发 4 邻域漫延，返回"被撑住"标记数组 */
  static computeSupport(grid: string[][]): Uint8Array {
    const h = grid.length, w = grid[0].length;
    const seen = new Uint8Array(w * h);
    const stack: [number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (Tiles.get(grid[y][x])?.anchor) { seen[y * w + x] = 1; stack.push([x, y]); }
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
  static findUnsupported(rows: string[]): CellRef[] {
    const grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
    const seen = Terrain.computeSupport(grid);
    const w = grid[0].length;
    const out: CellRef[] = [];
    grid.forEach((row, y) => row.forEach((c, x) => { if (Tiles.get(c)?.canFall && !seen[y * w + x]) out.push({ x, y }); }));
    return out;
  }

  /** 没被撑住的可掉落格子 → 按连通块分组变成碎块 */
  resolveSupport(): void {
    const seen = Terrain.computeSupport(this.grid);
    const idx = (x: number, y: number) => y * this.w + x;
    const grouped = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!Tiles.get(this.grid[y][x])?.canFall || seen[idx(x, y)] || grouped[idx(x, y)]) continue;
        const cells: ChunkCell[] = [];
        const st: [number, number][] = [[x, y]];
        grouped[idx(x, y)] = 1;
        while (st.length) {
          const [px, py] = st.pop()!;
          cells.push({ x: px, y: py, id: this.grid[py][px] });
          for (const [dx, dy] of NEIGHBORS) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
            if (grouped[idx(nx, ny)] || seen[idx(nx, ny)] || !Tiles.get(this.grid[ny][nx])?.canFall) continue;
            grouped[idx(nx, ny)] = 1; st.push([nx, ny]);
          }
        }
        this.spawnChunk(cells);
      }
  }

  private spawnChunk(cells: ChunkCell[]): void {
    cells.forEach(c => this.set(c.x, c.y, AIR));
    const scene = this.host.scene;
    const container = scene.add.container(0, 0).setDepth(5);
    cells.forEach(c => container.add(scene.add.image(c.x * this.T + this.T / 2, c.y * this.T + this.T / 2, 'tiles', Terrain.frameOf(c.id))));
    const chunk: Chunk = { id: this.nextChunkId++, cells, container, vy: 0, py: 0, floatSpeed: Tiles.get(cells[0].id)?.floatSpeed ?? 0, t: 0 };
    this.chunks.push(chunk);
    this.host.onChunkFall?.(chunk);
  }

  /** 从外面放回来一块（比如驮着它的怪物没了），从给定格子位置继续掉 */
  addChunk(cells: ChunkCell[], container: Phaser.GameObjects.Container): void {
    const T = this.T;
    container.setPosition(0, 0);
    (container.list as Phaser.GameObjects.Image[]).forEach((img, k) => img.setPosition(cells[k].x * T + T / 2, cells[k].y * T + T / 2));
    const chunk: Chunk = { id: this.nextChunkId++, cells, container, vy: 0, py: 0, floatSpeed: Tiles.get(cells[0].id)?.floatSpeed ?? 0, t: 0 };
    this.chunks.push(chunk);
    this.host.onChunkFall?.(chunk);
  }

  /** 碎块每帧更新：整体下落，任一格子下方被挡住就落地并并回格子 */
  updateChunks(dt: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      ch.t += dt;
      ch.vy = ch.floatSpeed > 0 ? ch.floatSpeed : Math.min(ch.vy + this.opts.chunkGravity * dt, this.opts.chunkMaxFall);
      ch.py += ch.vy * dt;
      if (ch.floatSpeed > 0 && this.host.catchChunk?.(ch)) { this.chunks.splice(i, 1); continue; }
      let landed = false;
      while (ch.py >= this.T) {
        const blocked = ch.cells.some(c => this.isSolid(c.x, c.y + 1) || this.chunkCellAt(c.x, c.y + 1, ch));
        if (blocked) { landed = true; break; }
        ch.cells.forEach(c => { c.y += 1; });
        ch.py -= this.T;
      }
      if (landed) {
        ch.py = 0;
        ch.container.destroy();
        ch.cells.forEach(c => this.set(c.x, c.y, c.id));
        this.chunks.splice(i, 1);
        this.host.onChunkLand?.(ch);
        this.resolveSupport();
      } else {
        ch.container.y = ch.py;
        ch.container.x = ch.floatSpeed > 0 ? Math.sin(ch.t * 2.5) * 4 : 0;   // 飘落时左右轻晃
        (ch.container.list as Phaser.GameObjects.Image[]).forEach((img, k) => { img.y = ch.cells[k].y * this.T + this.T / 2; });
      }
    }
  }

  private chunkCellAt(x: number, y: number, except: Chunk): boolean {
    return this.chunks.some(ch => ch !== except && ch.cells.some(c => c.x === x && c.y === y));
  }

  /** 房间重置：恢复矩形内的格子，清掉范围内的碎块 */
  resetRect(x0: number, y0: number, w: number, h: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      if (ch.cells.some(c => c.x >= x0 && c.x < x0 + w && c.y >= y0 && c.y < y0 + h)) { ch.container.destroy(); this.chunks.splice(i, 1); }
    }
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (this.grid[y][x] !== this.original[y][x]) this.set(x, y, this.original[y][x]);
    this.resolveSupport();
  }

  /** 碎块当前在世界里的包围盒（含下落的小数偏移和飘落的左右晃动） */
  chunkBounds(ch: Chunk): { x: number; y: number; w: number; h: number } {
    const T = this.T;
    const xs = ch.cells.map(c => c.x), ys = ch.cells.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX * T + ch.container.x, y: minY * T + ch.py, w: (maxX - minX + 1) * T, h: (maxY - minY + 1) * T };
  }

  /** 直接拿掉一块正在下落的碎块（比如被 Boss 吞了），不并回地形 */
  removeChunk(ch: Chunk): void {
    const i = this.chunks.indexOf(ch);
    if (i < 0) return;
    ch.container.destroy();
    this.chunks.splice(i, 1);
  }

  forEachChunkCell(fn: (ch: Chunk, px: number, py: number, w: number, h: number) => void): void {
    const T = this.T;
    this.chunks.forEach(ch => ch.cells.forEach(c => fn(ch, c.x * T, c.y * T + ch.py, T, T)));
  }

  cellsOverlapRect(cells: CellRef[], rect: { x: number; y: number; width: number; height: number }): boolean {
    const T = this.T;
    return cells.some(c => rect.x < c.x * T + T && rect.x + rect.width > c.x * T && rect.y < c.y * T + T && rect.y + rect.height > c.y * T);
  }
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
