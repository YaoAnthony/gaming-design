// ===== 格子地形：网格本身、爆炸与烧毁、支撑检测、房间重置 =====
// 所有"这个格子能不能炸 / 会不会掉 / 挡不挡人"都问注册表（Tiles），这里不认识具体砖块字符。
// 画面在 TerrainView，碎块下落在 Chunks，纯算法在 frames / blast / support：这里只剩网格状态和把它们串起来。
import type Phaser from 'phaser';
import type { CellBox, CellRef, TileDef, TerrainCheckpoint, ChunkCheckpoint } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { TerrainView } from './TerrainView';
import { Chunks, type Chunk, type ChunkCell } from './Chunks';
import { frameAt, frameOf, isWallAt, maskAt, pieceTexture } from './frames';
import { blastCells, burnedTo, computeChain, findLooseGroups, isChainEnd, NEIGHBORS, type BlastCell, type RemovedCell } from './blast';
import { computeSupport, findUnmounted, findUnsupported, mountSide, unsupportedGroups } from './support';

export { WALL_GID, type TileView } from './frames';
export type { BlastCell, RemovedCell } from './blast';
export type { Chunk, ChunkCell } from './Chunks';

/** 箱子顶边蹭进头顶砖块不到这么多像素，当作没碰到（浮点误差） */
const CEILING_GRAZE = 0.5;

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
  /** 挂着的砖（尖刺）因为下面没了而碎掉，用来播特效 */
  onCellsBroken?(cells: RemovedCell[]): void;
  /** 砖被爆炸炸没、被引线烧没了（不含开门这种 destroyCellsForce），用来播碎裂特效 */
  onCellsDestroyed?(cells: RemovedCell[]): void;
  /** 砖被引线烧裂了（岩石 → 碎岩，还在），用来播裂开的特效 */
  onCellsCracked?(cells: CellRef[]): void;
  /** 这个格子被地形以外的东西占着（比如箱子）：碎块落在它上面，它上面的砖算被撑住 */
  occupied?(x: number, y: number): boolean;
  /** 碎块没落地就被拿掉了（房间重置、被吞掉）：挂在它身上的东西（物理平台）一起清 */
  onChunkRemoved?(chunk: Chunk): void;
  /** 这一格的砖由别人画、别人做碰撞（比如正在移动的方块）：瓦片层不放这一格。格子本身还在网格里，爆炸、支撑照常算 */
  drawnElsewhere?(x: number, y: number): boolean;
}

export class Terrain {
  readonly w: number;
  readonly h: number;
  readonly T: number;
  readonly grid: string[][];
  readonly original: string[][];
  private readonly view: TerrainView;
  private readonly chunkSys: Chunks;
  private readonly boundaryId: string;
  /** 每格材料的来源格（格子序号）；-1 = 空气或来历不明。碎块掉下去落地时带着来源走 */
  private readonly origin: Int32Array;
  /** 还没执行的延迟摧毁 */
  private pending: Phaser.Time.TimerEvent[] = [];
  private pendingCells = new Map<Phaser.Time.TimerEvent, RemovedCell[]>();

  // 纯函数挂在类上，老的调用方式（Terrain.frameAt(...)）和单测不用改
  static readonly frameOf = frameOf;
  static readonly maskAt = maskAt;
  static readonly frameAt = frameAt;
  static readonly isWallAt = isWallAt;
  static readonly pieceTexture = pieceTexture;
  static readonly isChainEnd = isChainEnd;
  static readonly computeChain = computeChain;
  static readonly burnedTo = burnedTo;
  static readonly findLooseGroups = findLooseGroups;
  static readonly findUnmounted = findUnmounted;
  static readonly computeSupport = computeSupport;
  static readonly findUnsupported = findUnsupported;

  constructor(private readonly host: TerrainHost, rows: string[], private opts: TerrainOptions) {
    this.T = opts.tile;
    this.w = rows[0].length;
    this.h = rows.length;
    this.grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
    this.original = this.grid.map(r => r.slice());
    this.origin = new Int32Array(this.w * this.h);
    this.grid.forEach((r, y) => r.forEach((c, x) => { this.origin[y * this.w + x] = c === AIR ? -1 : y * this.w + x; }));
    this.boundaryId = (Tiles.filter(d => d.anchor)[0] ?? { id: AIR }).id;
    this.view = new TerrainView(host.scene, this.grid, this.T, (x, y) => !!host.drawnElsewhere?.(x, y));
    this.chunkSys = new Chunks({
      scene: host.scene, T: this.T,
      gravity: () => ({ chunkGravity: this.opts.chunkGravity, chunkMaxFall: this.opts.chunkMaxFall }),
      isSolid: (x, y) => this.isSolid(x, y),
      occupied: (x, y) => !!host.occupied?.(x, y),
      originOf: (x, y) => this.origin[y * this.w + x],
      set: (x, y, id, from) => this.set(x, y, id, from),
      onCellsCleared: cells => this.breakMounted(cells),
      onLanded: () => this.resolveSupport(),
      onChunkFall: ch => host.onChunkFall?.(ch),
      onChunkLand: ch => host.onChunkLand?.(ch),
      catchChunk: ch => !!host.catchChunk?.(ch),
      onChunkRemoved: ch => host.onChunkRemoved?.(ch),
    });
  }

  setOptions(opts: Partial<TerrainOptions>): void { this.opts = { ...this.opts, ...opts }; }

  // ---------- 画面（TerrainView） ----------
  get layer(): Phaser.Tilemaps.TilemapLayer { return this.view.layer; }
  enableShading(): void { this.view.enableShading((x, y) => this.isSolid(x, y)); }
  enableShadow(dx: number, dy: number, alpha: number): void { this.view.enableShadow(dx, dy, alpha); }
  /** 场景关闭时调：放掉地形占着的全局贴图 */
  destroy(): void { this.view.destroy(); }
  /** 这些格子重新按 drawnElsewhere 决定画不画（接管 / 交还某些格子的时候调）；旁边的墙跟着重拼 */
  refreshCells(cells: CellRef[]): void { this.view.refreshCells(cells); }

  // ---------- 网格 ----------
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.boundaryId;
    return this.grid[y][x];
  }
  def(x: number, y: number): TileDef { return Tiles.get(this.get(x, y)) ?? Tiles.get(AIR)!; }

  /** 这一格致命的区域（格内像素）：不危险 = 空；改挂在旁边的尖刺按挂法取，其它用 hazardBox（不设 = 整格） */
  hazardBoxes(x: number, y: number): CellBox[] {
    const d = this.def(x, y);
    if (!d.hazard) return [];
    const side = d.sideMount ? mountSide(this.grid, x, y) : null;
    if (side && side !== 'down') return d.sideMount!.boxes[side];
    return [d.hazardBox ?? { x: 0, y: 0, w: this.T, h: this.T }];
  }
  isSolid(x: number, y: number): boolean { return this.def(x, y).solid; }
  /** 这一格能站上去：实心砖，或者被箱子之类的机制占着（怪物判断前面是不是悬崖用） */
  isFooting(x: number, y: number): boolean { return this.isSolid(x, y) || !!this.host.occupied?.(x, y); }
  rows(): string[] { return this.grid.map(r => r.join('')); }

  /** 网格每改一格加一：依赖网格的缓存（起跳预览）拿它判断要不要重算 */
  get revision(): number { return this.rev; }
  private rev = 0;

  /** @param from 这块材料的来源格；不写 = 就是这一格本身（空气是 -1） */
  set(x: number, y: number, id: string, from?: number): void {
    this.rev++;
    this.grid[y][x] = id;
    this.origin[y * this.w + x] = id === AIR ? -1 : from ?? y * this.w + x;
    this.view.cellChanged(x, y);
  }

  /**
   * 一整组格子一起平移 (dx, dy)，每格的材料和来源跟着走（移动方块用）。先全部腾空再放下，组内互相覆盖没关系；
   * 目标格原来有的东西会被盖掉，调用方负责先检查。腾出来的格子上挂着的砖（尖刺）碎掉，靠它撑着的东西重新判支撑
   */
  moveCells(cells: CellRef[], dx: number, dy: number): void {
    const moving = cells
      .filter(c => c.x >= 0 && c.y >= 0 && c.x < this.w && c.y < this.h && this.grid[c.y][c.x] !== AIR)
      .map(c => ({ x: c.x, y: c.y, id: this.grid[c.y][c.x], from: this.origin[c.y * this.w + c.x] }));
    moving.forEach(c => this.set(c.x, c.y, AIR));
    moving.forEach(c => { const x = c.x + dx, y = c.y + dy; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.set(x, y, c.id, c.from); });
    const landed = new Set(moving.map(c => `${c.x + dx},${c.y + dy}`));
    const vacated = moving.filter(c => !landed.has(`${c.x},${c.y}`));
    this.breakMounted(vacated);
    this.resolveSupportNear(vacated);
  }

  // ---------- 碰撞器的 process 回调 ----------
  /**
   * 人 / 怪物和地形碰撞器的 process 回调：单向平台（木板）只在对方从上面落下来时才挡——
   * 这一步开始时底边已经在格子顶上、并且没在往上走。从下面跳上来、从侧面走过去都直接穿过。
   */
  readonly landsOnOneWay: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj, t) => {
    const tile = t as Phaser.Tilemaps.Tile;
    if (!this.def(tile.x, tile.y).oneWay) return true;
    return Terrain.landsFromAbove((obj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body, tile.pixelY);
  };

  /** 单向平台挡不挡这具身体：没在往上走，并且这一步开始时底边不低于平台顶（留 1px 余量） */
  static landsFromAbove(body: { velocity: { y: number }; prev: { y: number }; height: number }, top: number): boolean {
    return body.velocity.y >= 0 && body.prev.y + body.height <= top + 1;
  }

  /**
   * 箱子和地形碰撞器的 process 回调：箱子不跟"箱子穿过"的砖（木板）碰撞；
   * 头顶的砖只蹭进去不到 CEILING_GRAZE 像素（浮点误差，箱子和一格高的隧道一样高）也不算，不然推不进隧道
   */
  readonly blocksBoxes: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj, t) => {
    const tile = t as Phaser.Tilemaps.Tile;
    if (this.def(tile.x, tile.y).boxPassThrough) return false;
    const body = (obj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    const graze = (tile.y + 1) * this.T - body.top;
    return !(graze > 0 && graze < CEILING_GRAZE);
  };

  // ---------- 爆炸、烧毁 ----------
  blastCells(cx: number, cy: number, radius: number): BlastCell[] { return blastCells(cx, cy, radius); }

  /** 这个格子现在能不能被爆炸直接命中（可炸，且如果是"只点两端"的材质，必须是链条端点） */
  canIgnite(x: number, y: number): boolean {
    const def = this.def(x, y);
    if (!def.destructible) return false;
    if (def.igniteAtEndsOnly && !isChainEnd(this.grid, x, y)) return false;
    return true;
  }

  /** 圆形爆炸预览：返回会被摧毁的格子（脆岩多一圈感应，含连锁） */
  previewExplosion(cx: number, cy: number, radius = this.opts.explosionRadius): RemovedCell[] {
    const R = radius;
    const maxBonus = Tiles.list().reduce((m, d) => Math.max(m, d.blastSensitivity), 0);
    const seeds: RemovedCell[] = [];
    blastCells(cx, cy, R + maxBonus).forEach(c => {
      if (!this.canIgnite(c.x, c.y)) return;
      const def = this.def(c.x, c.y);
      if (c.d <= R + def.blastSensitivity) seeds.push({ x: c.x, y: c.y, id: def.id, def });
    });
    return computeChain(this.grid, seeds);
  }

  /** 任意模板预览：模板内可炸的格子（含连锁；不做感应范围扩展） */
  previewCells(cells: CellRef[]): RemovedCell[] {
    const seeds: RemovedCell[] = [];
    cells.forEach(c => { if (this.canIgnite(c.x, c.y)) { const def = this.def(c.x, c.y); seeds.push({ x: c.x, y: c.y, id: def.id, def }); } });
    return computeChain(this.grid, seeds);
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
    /** 按"多少毫秒后摧毁"分组：同一跳里不同材料的延迟可以不一样 */
    const delayed = new Map<number, RemovedCell[]>();
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y);
      const hop = (c as Partial<RemovedCell>).hop ?? 0;
      if (hop === 0 ? !this.canIgnite(c.x, c.y) : !def.destructible) return;
      const r: RemovedCell = { x: c.x, y: c.y, id: def.id, def, hop };
      removed.push(r);
      if (def.chainDelayMs > 0 && hop > 0) { const ms = hop * def.chainDelayMs; const arr = delayed.get(ms) ?? []; arr.push(r); delayed.set(ms, arr); }
      else immediate.push(r);
    });
    immediate.forEach(c => this.set(c.x, c.y, AIR));
    if (immediate.length) { this.host.onCellsDestroyed?.(immediate); this.breakMounted(immediate); this.resolveSupportNear(immediate); this.shake(immediate, 0); }
    [...delayed.entries()].sort((a, b) => a[0] - b[0]).forEach(([delayMs, group]) => {
      this.scheduleDestruction(group, delayMs);
    });
    return removed;
  }

  private scheduleDestruction(group: RemovedCell[], delayMs: number): void {
    const timer: Phaser.Time.TimerEvent = this.host.scene.time.delayedCall(delayMs, () => {
      this.pending = this.pending.filter(t => t !== timer); this.pendingCells.delete(timer);
      const still = group.filter(c => this.grid[c.y][c.x] === c.id);
      if (!still.length) return;
      still.forEach(c => this.set(c.x, c.y, AIR));
      this.host.onCellsDestroyed?.(still); this.breakMounted(still);
      this.resolveSupportNear(still); this.shake(still, 0); this.host.onFuseBurn?.(still);
    });
    this.pending.push(timer); this.pendingCells.set(timer, group);
  }

  checkpointState(): TerrainCheckpoint {
    return { rows: this.rowsIn(0, 0, this.w, this.h), origin: [...this.origin], chunks: this.chunkSys.checkpointState(),
      pending: [...this.pendingCells].map(([t, cells]) => ({ cells: cells.map(c => ({ x: c.x, y: c.y, id: c.id })), ms: t.getRemaining() })) };
  }

  restoreCheckpoint(s: TerrainCheckpoint): void {
    this.cancelPending();
    while (this.chunkSys.list.length) this.chunkSys.dropAt(this.chunkSys.list.length - 1);
    s.rows.forEach((row, y) => [...row].forEach((id, x) => { this.set(x, y, id); this.original[y][x] = id; }));
    this.origin.set(s.origin);
    s.chunks.forEach(ch => this.chunkSys.restoreChunk(ch));
    s.pending.forEach(p => this.scheduleDestruction(p.cells.map(c => ({ ...c, def: Tiles.get(c.id)! })), p.ms));
  }

  restoreCarriedChunk(s: ChunkCheckpoint): Chunk { return this.chunkSys.restoreChunk(s, true); }

  /** 取消全部延迟摧毁（整张图的，不分房间） */
  cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = []; this.pendingCells.clear();
  }

  /** 引线烧到这些格子：岩石裂成碎岩（还是实心、还撑着东西），其它实心的烧没；shatter（紫色引线）连岩石也直接烧没。然后做支撑检测。返回烧没的格子 */
  burnCells(cells: CellRef[], shatter = false): RemovedCell[] {
    const removed: RemovedCell[] = [], cracked: CellRef[] = [];
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y), to = burnedTo(def.id, shatter);
      if (to === def.id) return;
      this.set(c.x, c.y, to, this.origin[c.y * this.w + c.x]);   // 裂开的还是原来那块材料
      if (to === AIR) removed.push({ x: c.x, y: c.y, id: def.id, def, hop: 0 });
      else cracked.push({ x: c.x, y: c.y });
    });
    if (cracked.length) this.host.onCellsCracked?.(cracked);
    if (removed.length) { this.host.onCellsDestroyed?.(removed); this.breakMounted(removed); this.resolveSupportNear(removed); }
    return removed;
  }

  /** 无条件摧毁（开门、吃豆人炸弹用）：不管可不可炸、是不是岩石，实心的就炸掉，然后做支撑检测 */
  destroyCellsForce(cells: CellRef[]): RemovedCell[] {
    const removed: RemovedCell[] = [];
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y);
      if (!def.solid) return;
      removed.push({ x: c.x, y: c.y, id: def.id, def, hop: 0 });
      this.set(c.x, c.y, AIR);
    });
    if (removed.length) { this.breakMounted(removed); this.resolveSupportNear(removed); }
    return removed;
  }

  // ---------- 松脱与支撑 ----------
  /** 预览：会松脱并真正掉下去的格子 */
  previewLoose(centers: CellRef[], radius: number): CellRef[] {
    return findLooseGroups(this.grid, centers, radius).filter(g => this.canGroupFall(g)).flat();
  }

  /** 一组格子作为整体能不能往下掉：每一格的正下方要么是空的，要么还是这组自己的格子 */
  canGroupFall(group: CellRef[]): boolean {
    const inGroup = new Set(group.map(c => `${c.x},${c.y}`));
    return group.every(c => inGroup.has(`${c.x},${c.y + 1}`) || !this.isSolid(c.x, c.y + 1));
  }

  /** 震动：centers 周围会松脱的材质整块变成碎块掉下来。已经坐在实地上、掉不下去的不理会（不出特效）。返回松脱的格子数 */
  shake(centers: CellRef[], radius: number): number {
    const groups = findLooseGroups(this.grid, centers, radius).filter(g => this.canGroupFall(g));
    groups.forEach(g => this.chunkSys.spawn(g.map(c => ({ x: c.x, y: c.y, id: this.grid[c.y][c.x] }))));
    if (groups.length) this.resolveSupport();
    return groups.reduce((n, g) => n + g.length, 0);
  }

  /** 下面没了的尖刺一起碎掉 */
  private breakMounted(cleared: CellRef[]): void {
    const broken: RemovedCell[] = findUnmounted(this.grid, cleared).map(c => {
      const def = this.def(c.x, c.y);
      return { x: c.x, y: c.y, id: def.id, def, hop: 0 };
    });
    if (!broken.length) return;
    broken.forEach(c => this.set(c.x, c.y, AIR));
    this.host.onCellsBroken?.(broken);
  }

  /**
   * 这些格子刚被拿掉之后的支撑检测。会因此掉下去的东西一定挨着被拿掉的格子，而且是会掉的材料
   * （锚点自己撑自己）：四周一个会掉的格子都没有，就不用对整张地图做一遍漫延
   */
  resolveSupportNear(cleared: CellRef[]): void {
    const risky = cleared.some(c => NEIGHBORS.some(([dx, dy]) => Tiles.get(this.grid[c.y + dy]?.[c.x + dx])?.canFall));
    if (risky) this.resolveSupport();
  }

  /** 没被撑住的可掉落格子 → 按连通块分组变成碎块 */
  resolveSupport(): void {
    const seen = computeSupport(this.grid, (x, y) => !!this.host.occupied?.(x, y + 1));
    unsupportedGroups(this.grid, seen).forEach(group => {
      this.chunkSys.spawn(group.map(c => ({ x: c.x, y: c.y, id: this.grid[c.y][c.x], from: this.origin[c.y * this.w + c.x] })));
    });
  }

  // ---------- 碎块（Chunks） ----------
  get chunks(): Chunk[] { return this.chunkSys.list; }
  /** 从外面放回来一块（比如驮着它的怪物没了），从给定格子位置继续掉 */
  addChunk(cells: ChunkCell[], container: Phaser.GameObjects.Container): Chunk { return this.chunkSys.add(cells, container); }
  /** 碎块每帧更新（体积感也在这里跟着刷新） */
  updateChunks(dt: number): void {
    this.view.update((x, y) => this.isSolid(x, y));
    this.chunkSys.update(dt);
  }
  /** 直接拿掉一块正在下落的碎块（比如被 Boss 吞了），不并回地形 */
  removeChunk(ch: Chunk): void { this.chunkSys.remove(ch); }
  /** 碎块当前在世界里的包围盒（含下落的小数偏移和飘落的左右晃动） */
  chunkBounds(ch: Chunk): { x: number; y: number; w: number; h: number } { return this.chunkSys.bounds(ch); }
  forEachChunkCell(fn: (ch: Chunk, px: number, py: number, w: number, h: number) => void): void { this.chunkSys.forEachCell(fn); }

  cellsOverlapRect(cells: CellRef[], rect: { x: number; y: number; width: number; height: number }): boolean {
    const T = this.T;
    return cells.some(c => rect.x < c.x * T + T && rect.x + rect.width > c.x * T && rect.y < c.y * T + T && rect.y + rect.height > c.y * T);
  }

  // ---------- 重置 ----------
  /**
   * 把矩形（一个房间，或整张图）恢复成初始地形；keep 返回 true 的格子保持现状（比如 Boss 炸开的通道）。
   * 按材料的来源算，不按它现在在哪：
   * - 这个房间的材料掉到别的房间去了（落了地的、还在掉的），一起收回来，不会一边恢复一边在隔壁留一份
   * - 别的房间的材料现在在这个房间里（落在这里的、正从这里掉过的），放回它原来的位置（原位空着才放），不会凭空消失
   * - 延迟连锁（一跳一跳往下烧的）不管在哪个房间，全部停掉
   */
  resetRect(x0: number, y0: number, w: number, h: number, keep?: (x: number, y: number) => boolean): void {
    const inRect = (x: number, y: number) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    const fromRect = (from: number | undefined) => from !== undefined && from >= 0 && inRect(from % this.w, Math.floor(from / this.w));
    this.cancelPending();
    /** 要放回原处的外来材料：来源格 + 材料 */
    const goHome: { from: number; id: string }[] = [];
    const chunks = this.chunkSys.list;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const ch = chunks[i];
      const mine = ch.cells.some(c => fromRect(c.from));
      if (!mine && !ch.cells.some(c => inRect(c.x, c.y))) continue;
      if (!mine) ch.cells.forEach(c => { if (c.from !== undefined && c.from >= 0) goHome.push({ from: c.from, id: c.id }); });
      this.chunkSys.dropAt(i);
    }
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x, o = this.origin[i];
        if (!inRect(x, y)) {
          if (fromRect(o) && this.grid[y][x] !== AIR) this.set(x, y, AIR);   // 这个房间的材料落在了别处：收回来
          continue;
        }
        if (keep?.(x, y)) continue;
        const orig = this.original[y][x], origFrom = orig === AIR ? -1 : i;
        if (this.grid[y][x] === orig && o === origFrom) continue;
        if (this.grid[y][x] !== AIR && o >= 0 && !fromRect(o)) goHome.push({ from: o, id: this.grid[y][x] });
        this.set(x, y, orig);
      }
    goHome.forEach(g => {
      const x = g.from % this.w, y = Math.floor(g.from / this.w);
      if (this.grid[y][x] === AIR) this.set(x, y, g.id, g.from);
    });
    this.resolveSupport();
  }

  // ---------- 解开（复原点前移） ----------
  /** 还有东西在变：一跳一跳的连锁没烧完，或者有碎块正落在这个矩形里 */
  busyIn(x0: number, y0: number, w: number, h: number): boolean {
    if (this.pending.length) return true;
    return this.chunkSys.list.some(ch => ch.cells.some(c => c.x >= x0 && c.x < x0 + w && c.y >= y0 && c.y < y0 + h));
  }

  /**
   * 矩形里现在的样子记成它的初始状态：之后 resetRect 回到这里。里面的材料都算这一格自己的；
   * 从这里掉到别处的材料算落脚那一格的（这个房间重置时不再收回来）
   */
  commitRect(x0: number, y0: number, w: number, h: number): void {
    const inRect = (x: number, y: number) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x, o = this.origin[i];
        if (inRect(x, y)) {
          this.original[y][x] = this.grid[y][x];
          this.origin[i] = this.grid[y][x] === AIR ? -1 : i;
        } else if (o >= 0 && inRect(o % this.w, Math.floor(o / this.w))) this.origin[i] = i;
      }
  }

  /** 读档：矩形里换成存下来的样子（rows 是这个矩形的字符画），同时记成它的初始状态 */
  restoreRect(x0: number, y0: number, rows: string[]): void {
    rows.forEach((row, dy) => [...row].forEach((c, dx) => {
      const x = x0 + dx, y = y0 + dy;
      if (x >= this.w || y >= this.h) return;
      const id = Tiles.has(c) ? c : AIR;
      this.original[y][x] = id;
      if (this.grid[y][x] !== id) this.set(x, y, id);
      this.origin[y * this.w + x] = id === AIR ? -1 : y * this.w + x;
    }));
    this.resolveSupport();
  }

  /** 矩形里现在的样子（存档用） */
  rowsIn(x0: number, y0: number, w: number, h: number): string[] {
    return this.grid.slice(y0, y0 + h).map(r => r.slice(x0, x0 + w).join(''));
  }

  /** 这块材料的来源格在不在这个矩形里（重置时判断东西归不归这个房间） */
  originIn(from: number | undefined, x0: number, y0: number, w: number, h: number): boolean {
    if (from === undefined || from < 0) return false;
    const x = from % this.w, y = Math.floor(from / this.w);
    return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
  }
}
