// ===== 格子地形：爆炸破坏、支撑检测、失去支撑的地块整体下落 =====
// 所有"这个格子能不能炸 / 会不会掉 / 挡不挡人"都问注册表（Tiles），这里不认识具体砖块字符。
import type Phaser from 'phaser';
import type { CellRef, TileDef } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { AUTOTILE_VARIANTS } from '@/asset';
import { WALL_TEXTURE, WALL_VARIANTS, wallFrame, wallMask, wallTemplates } from './walls';
import { depthToAir, shadeOf } from './shading';

/** 箱子顶边蹭进头顶砖块不到这么多像素，当作没碰到（浮点误差） */
const CEILING_GRAZE = 0.5;

/** tilemap 里墙那套贴图（拼好的 walls）的第一个编号：墙砖的格子编号 = WALL_GID + wallFrame */
export const WALL_GID = 1000;

export type TileView = 'game' | 'editor';

export interface BlastCell extends CellRef { d: number }
export interface RemovedCell extends CellRef { id: string; def: TileDef; /** 连锁传导的跳数：0 = 直接命中，n = 沿链条传导了 n 格 */ hop?: number }
/** from = 这块材料原本在地图上哪一格（格子序号 y * w + x）；-1 / 不写 = 不是地图原有的。房间重置按它判断材料归哪个房间 */
export interface ChunkCell extends CellRef { id: string; from?: number }
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
  /** 挂着的砖（尖刺）因为下面没了而碎掉，用来播特效 */
  onCellsBroken?(cells: RemovedCell[]): void;
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
  readonly chunks: Chunk[] = [];
  private nextChunkId = 1;
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly boundaryId: string;
  /** 每格材料的来源格（格子序号）；-1 = 空气或来历不明。碎块掉下去落地时带着来源走 */
  private readonly origin: Int32Array;

  constructor(private readonly host: TerrainHost, rows: string[], private opts: TerrainOptions) {
    this.T = opts.tile;
    this.w = rows[0].length;
    this.h = rows.length;
    this.grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
    this.original = this.grid.map(r => r.slice());
    this.origin = new Int32Array(this.w * this.h);
    this.grid.forEach((r, y) => r.forEach((c, x) => { this.origin[y * this.w + x] = c === AIR ? -1 : y * this.w + x; }));
    this.boundaryId = (Tiles.filter(d => d.anchor)[0] ?? { id: AIR }).id;

    const data = this.grid.map((r, y) => r.map((_, x) => Terrain.frameAt(this.grid, x, y, 'game', this.wallAt)));
    this.map = host.scene.make.tilemap({ data, tileWidth: this.T, tileHeight: this.T });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', this.T, this.T, 0, 0)!;
    const walls = this.map.addTilesetImage(WALL_TEXTURE, WALL_TEXTURE, this.T, this.T, 0, 0, WALL_GID)!;   // 墙：按周围 8 格拼好的那张
    this.layer = this.map.createLayer(0, [tileset, walls], 0, 0)!;
    const collide: number[] = [];
    Tiles.filter(d => d.solid && d.gameFrame >= 0).forEach(d => { for (let k = 0; k < (d.autotile ? AUTOTILE_VARIANTS : 1); k++) collide.push(d.gameFrame + k); });
    Tiles.filter(d => d.solid && !!d.wall).forEach(d => {
      const base = WALL_GID + wallTemplates().indexOf(d.wall!) * WALL_VARIANTS.length;
      for (let k = 0; k < WALL_VARIANTS.length; k++) collide.push(base + k);
    });
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

  /**
   * 看邻居选帧：游戏里的墙按周围 8 格从拼好的墙贴图里取（WALL_GID + wallFrame）；自动拼贴的材质用 起始帧 + 掩码；
   * 其它材质就是起始帧。游戏视角用 gameFrame，编辑器用 frame（编辑器里墙也整块画）。
   * isWall(x, y) = 那一格算不算连着的墙，默认见 isWallAt
   */
  static frameAt(grid: string[][], x: number, y: number, view: TileView = 'game', isWall?: (x: number, y: number) => boolean): number {
    const id = grid[y]?.[x];
    const d = id != null ? Tiles.get(id) : undefined;
    if (!d) return -1;
    if (view === 'game' && d.wall) {
      const at = isWall ?? ((wx: number, wy: number) => Terrain.isWallAt(grid, wx, wy));
      return WALL_GID + wallFrame(d.wall, wallMask((dx, dy) => at(x + dx, y + dy)));
    }
    const base = view === 'game' ? d.gameFrame : d.frame;
    if (base < 0) return -1;
    return d.autotile ? base + Terrain.maskAt(grid, x, y) : base;
  }

  /** 拼墙时这一格算不算墙：墙类砖算，地图外面也算（地图边上的墙朝外那面不画表面） */
  static isWallAt(grid: string[][], x: number, y: number): boolean {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return true;
    return !!Tiles.get(grid[y][x])?.wall;
  }

  /** 单独画的一块砖（掉落的碎块、移动方块）用什么贴图和帧：墙按 connected（它那一组里哪些方向的邻居是墙）拼，其它整块画 */
  static pieceTexture(id: string, connected: (dx: number, dy: number) => boolean): [string, number] {
    const d = Tiles.get(id);
    if (d?.wall) return [WALL_TEXTURE, wallFrame(d.wall, wallMask(connected))];
    return ['tiles', Terrain.frameOf(id)];
  }

  /** 拼墙时地图上哪些格子算墙：被别处接管着画的格子（移动方块）不算 */
  private readonly wallAt = (x: number, y: number): boolean =>
    Terrain.isWallAt(this.grid, x, y) && !(x >= 0 && y >= 0 && x < this.w && y < this.h && this.host.drawnElsewhere?.(x, y));

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.boundaryId;
    return this.grid[y][x];
  }
  def(x: number, y: number): TileDef { return Tiles.get(this.get(x, y)) ?? Tiles.get(AIR)!; }
  isSolid(x: number, y: number): boolean { return this.def(x, y).solid; }
  /** 这一格能站上去：实心砖，或者被箱子之类的机制占着（怪物判断前面是不是悬崖用） */
  isFooting(x: number, y: number): boolean { return this.isSolid(x, y) || !!this.host.occupied?.(x, y); }

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
  rows(): string[] { return this.grid.map(r => r.join('')); }

  /** @param from 这块材料的来源格；不写 = 就是这一格本身（空气是 -1） */
  set(x: number, y: number, id: string, from?: number): void {
    this.grid[y][x] = id;
    this.origin[y * this.w + x] = id === AIR ? -1 : from ?? y * this.w + x;
    this.refreshFrame(x, y);
    this.refreshNeighbors(x, y);
  }

  /** 邻居的图案跟着换：墙看 8 个邻居，自动拼贴的材质看上下左右 */
  private refreshNeighbors(x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      const d = Tiles.get(this.grid[ny][nx]);
      if (d?.wall || (d?.autotile && (dx === 0 || dy === 0))) this.refreshFrame(nx, ny);
    }
  }

  private refreshFrame(x: number, y: number): void {
    const f = this.host.drawnElsewhere?.(x, y) ? -1 : Terrain.frameAt(this.grid, x, y, 'game', this.wallAt);
    if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
    if (this.shadow) { if (f < 0) this.shadow.removeTileAt(x, y); else this.shadow.putTileAt(f, x, y).tint = 0x000000; }
    this.shadeDirty = true;
  }

  /** 体积感（见 enableShading）：一格一个点的小图，平滑放大盖在地形上；没开是 null */
  private shade: { tex: Phaser.Textures.CanvasTexture; pixels: ImageData } | null = null;
  private shadeDirty = false;

  /** 地形的体积感：实心砖越往里越暗（game/terrain/shading.ts），挨着空气的表面不变。砖块变化后下一帧重算 */
  enableShading(): void {
    if (this.shade) return;
    const key = `terrainshade${Terrain.shadeCount++}`;
    const tex = this.host.scene.textures.createCanvas(key, this.w, this.h)!;
    this.shade = { tex, pixels: tex.context.createImageData(this.w, this.h) };
    this.host.scene.add.image(0, 0, key).setOrigin(0).setScale(this.T).setDepth(0.5);
    this.shadeDirty = true;
    this.updateShading();
  }
  private static shadeCount = 0;

  private updateShading(): void {
    if (!this.shade || !this.shadeDirty) return;
    this.shadeDirty = false;
    // 被别处接管着画的格子（移动方块）算空气：它们会动，盖在原地的暗会对不上
    const depth = depthToAir(this.w, this.h, (x, y) => this.isSolid(x, y) && !this.host.drawnElsewhere?.(x, y));
    const px = this.shade.pixels.data;
    for (let i = 0; i < depth.length; i++) { px[i * 4 + 3] = Math.round(shadeOf(depth[i]) * 255); }
    this.shade.tex.context.putImageData(this.shade.pixels, 0, 0);
    this.shade.tex.refresh();
    this.shade.tex.setFilter(0);   // Phaser.Textures.FilterMode.LINEAR：平滑放大；重新上传会按像素风设置变回 NEAREST，每次都要再设
  }

  /** 地形的投影（见 enableShadow）；没开是 null */
  private shadow: Phaser.Tilemaps.TilemapLayer | null = null;

  /**
   * 地形的投影：同样的砖再画一层，往右下挪 (dx, dy) 像素、染黑、半透明，垫在地形后面 ——
   * 墙在背景上落一道硬边的影子，看着是浮在背景前面的，有层次。砖块变化时跟着一起改
   */
  enableShadow(dx: number, dy: number, alpha: number): void {
    if (this.shadow) return;
    const data = this.grid.map((r, y) => r.map((_, x) => this.layer.getTileAt(x, y)?.index ?? -1));
    const map = this.host.scene.make.tilemap({ data, tileWidth: this.T, tileHeight: this.T });
    const tiles = map.addTilesetImage('tiles', 'tiles', this.T, this.T, 0, 0)!;
    const walls = map.addTilesetImage(WALL_TEXTURE, WALL_TEXTURE, this.T, this.T, 0, 0, WALL_GID)!;
    this.shadow = map.createLayer(0, [tiles, walls], dx, dy)!.setAlpha(alpha).setDepth(-1);
    this.shadow.setTint(0x000000);
  }

  /** 这些格子重新按 drawnElsewhere 决定画不画（接管 / 交还某些格子的时候调）；旁边的墙跟着重拼 */
  refreshCells(cells: CellRef[]): void {
    cells.forEach(c => { if (c.x >= 0 && c.y >= 0 && c.x < this.w && c.y < this.h) { this.refreshFrame(c.x, c.y); this.refreshNeighbors(c.x, c.y); } });
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
    const maxBonus = Tiles.list().reduce((m, d) => Math.max(m, d.blastSensitivity), 0);
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
    if (immediate.length) { this.breakMounted(immediate); this.resolveSupportNear(immediate); this.shake(immediate, 0); }
    [...delayed.entries()].sort((a, b) => a[0] - b[0]).forEach(([delayMs, group]) => {
      const timer: Phaser.Time.TimerEvent = this.host.scene.time.delayedCall(delayMs, () => {
        this.pending = this.pending.filter(t => t !== timer);
        // 等的这段时间里格子可能已经变了（被别的爆炸炸掉、被重置）：只烧还是原来那种材料的
        const still = group.filter(c => this.grid[c.y][c.x] === c.id);
        if (!still.length) return;
        still.forEach(c => this.set(c.x, c.y, AIR));
        this.breakMounted(still);
        this.resolveSupportNear(still);
        this.shake(still, 0);
        this.host.onFuseBurn?.(still);
      });
      this.pending.push(timer);
    });
    return removed;
  }

  /** 还没执行的延迟摧毁 */
  private pending: Phaser.Time.TimerEvent[] = [];
  /** 取消全部延迟摧毁（整张图的，不分房间） */
  cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = [];
  }

  // ---- 松脱（脆岩）----
  /** 纯函数：距任一中心 ≤ radius + 材质感应距离 的"会松脱"格子，按相连同类分组 */
  static findLooseGroups(grid: string[][], centers: CellRef[], radius: number): CellRef[][] {
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

  /** 引线烧到一格之后它变成什么：会裂的（岩石）变成裂开的砖，其它实心的烧没，空气 / 不实心的不变。shatter = 猛火（紫色引线），会裂的也直接烧没 */
  static burnedTo(id: string, shatter = false): string {
    const d = Tiles.get(id);
    if (!d || !d.solid || d.fireproof) return id;
    return shatter ? AIR : d.crackTo ?? AIR;
  }

  /** 引线烧到这些格子：岩石裂成碎岩（还是实心、还撑着东西），其它实心的烧没；shatter（紫色引线）连岩石也直接烧没。然后做支撑检测。返回烧没的格子 */
  burnCells(cells: CellRef[], shatter = false): RemovedCell[] {
    const removed: RemovedCell[] = [];
    cells.forEach(c => {
      if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
      const def = this.def(c.x, c.y), to = Terrain.burnedTo(def.id, shatter);
      if (to === def.id) return;
      this.set(c.x, c.y, to, this.origin[c.y * this.w + c.x]);   // 裂开的还是原来那块材料
      if (to === AIR) removed.push({ x: c.x, y: c.y, id: def.id, def, hop: 0 });
    });
    if (removed.length) { this.breakMounted(removed); this.resolveSupportNear(removed); }
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

  // ---- 挂着的砖（尖刺）----
  /** 纯函数：这些格子刚被清空，正上方挂着的砖（mounted）里，下面已经不是实心的那些 */
  static findUnmounted(grid: string[][], cleared: CellRef[]): CellRef[] {
    const out: CellRef[] = [];
    const seen = new Set<string>();
    cleared.forEach(c => {
      const x = c.x, y = c.y - 1;
      if (y < 0 || seen.has(`${x},${y}`)) return;
      if (!Tiles.get(grid[y]?.[x])?.mounted) return;
      if (Tiles.get(grid[c.y]?.[x])?.solid) return;   // 下面还是实心的（比如同一格马上又被填上）
      seen.add(`${x},${y}`);
      out.push({ x, y });
    });
    return out;
  }

  /** 下面没了的尖刺一起碎掉 */
  private breakMounted(cleared: CellRef[]): void {
    const broken: RemovedCell[] = Terrain.findUnmounted(this.grid, cleared).map(c => {
      const def = this.def(c.x, c.y);
      return { x: c.x, y: c.y, id: def.id, def, hop: 0 };
    });
    if (!broken.length) return;
    broken.forEach(c => this.set(c.x, c.y, AIR));
    this.host.onCellsBroken?.(broken);
  }

  // ---- 支撑检测（纯函数，编辑器和单元测试也用）----
  /** 从所有锚点出发 4 邻域漫延，返回"被撑住"标记数组 */
  /** @param restsOn 额外的锚点：这一格下面有东西托着（比如箱子），它自己是实心的就算锚点 */
  static computeSupport(grid: string[][], restsOn?: (x: number, y: number) => boolean): Uint8Array {
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
  static findUnsupported(rows: string[]): CellRef[] {
    const grid = rows.map(r => r.split('').map(c => (Tiles.has(c) ? c : AIR)));
    const seen = Terrain.computeSupport(grid);
    const w = grid[0].length;
    const out: CellRef[] = [];
    grid.forEach((row, y) => row.forEach((c, x) => { if (Tiles.get(c)?.canFall && !seen[y * w + x]) out.push({ x, y }); }));
    return out;
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
    const seen = Terrain.computeSupport(this.grid, (x, y) => !!this.host.occupied?.(x, y + 1));
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
          cells.push({ x: px, y: py, id: this.grid[py][px], from: this.origin[idx(px, py)] });
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
    cells.forEach(c => { c.from ??= this.origin[c.y * this.w + c.x]; this.set(c.x, c.y, AIR); });
    this.breakMounted(cells);
    const scene = this.host.scene;
    const container = scene.add.container(0, 0).setDepth(5);
    // 墙按这一块碎块自己里面的邻居拼（它是单独掉下来的一整块）
    const ids = new Map(cells.map(c => [`${c.x},${c.y}`, c.id]));
    cells.forEach(c => container.add(scene.add.image(c.x * this.T + this.T / 2, c.y * this.T + this.T / 2,
      ...Terrain.pieceTexture(c.id, (dx, dy) => !!Tiles.get(ids.get(`${c.x + dx},${c.y + dy}`) ?? AIR)?.wall))));
    const chunk: Chunk = { id: this.nextChunkId++, cells, container, vy: 0, py: 0, floatSpeed: Tiles.get(cells[0].id)?.floatSpeed ?? 0, t: 0 };
    this.chunks.push(chunk);
    this.host.onChunkFall?.(chunk);
  }

  /** 从外面放回来一块（比如驮着它的怪物没了），从给定格子位置继续掉 */
  addChunk(cells: ChunkCell[], container: Phaser.GameObjects.Container): Chunk {
    const T = this.T;
    container.setPosition(0, 0);
    (container.list as Phaser.GameObjects.Image[]).forEach((img, k) => img.setPosition(cells[k].x * T + T / 2, cells[k].y * T + T / 2));
    const chunk: Chunk = { id: this.nextChunkId++, cells, container, vy: 0, py: 0, floatSpeed: Tiles.get(cells[0].id)?.floatSpeed ?? 0, t: 0 };
    this.chunks.push(chunk);
    this.host.onChunkFall?.(chunk);
    return chunk;
  }

  /** 碎块每帧更新：整体下落，任一格子下方被挡住就落地并并回格子 */
  updateChunks(dt: number): void {
    this.updateShading();
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      ch.t += dt;
      ch.vy = ch.floatSpeed > 0 ? ch.floatSpeed : Math.min(ch.vy + this.opts.chunkGravity * dt, this.opts.chunkMaxFall);
      ch.py += ch.vy * dt;
      if (ch.floatSpeed > 0 && this.host.catchChunk?.(ch)) { this.chunks.splice(i, 1); continue; }
      // 落地判定：下面是砖块就立刻落地（以前要等 py 走满一格才检查，碎块会先陷进地里一整格再弹回来；
      // 慢慢飘的纸尤其明显，站在上面的人会被一起带进地里）。下面是另一块还在掉的碎块，就贴着它一起掉。
      let landed = false;
      for (;;) {
        if (ch.cells.some(c => this.isSolid(c.x, c.y + 1) || this.host.occupied?.(c.x, c.y + 1))) { landed = true; break; }
        const below = this.chunkBelow(ch);
        if (below) {
          // 下面是另一块还在掉的碎块：贴着它一起掉（不超过它、不比它快），等它落地了自己再落地。不能在半空并进地形
          if (ch.py > below.py) ch.py = below.py;
          ch.vy = Math.min(ch.vy, below.vy);
          break;
        }
        if (ch.py < this.T) break;
        ch.cells.forEach(c => { c.y += 1; });
        ch.py -= this.T;
      }
      if (landed) {
        ch.py = 0;
        ch.container.destroy();
        ch.cells.forEach(c => this.set(c.x, c.y, c.id, c.from ?? -1));
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

  /** 紧贴在这块碎块下面的另一块碎块（它的某一格正下方是那一块的格子） */
  private chunkBelow(ch: Chunk): Chunk | undefined {
    return this.chunks.find(o => o !== ch && ch.cells.some(c => o.cells.some(d => d.x === c.x && d.y === c.y + 1)));
  }

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
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      const mine = ch.cells.some(c => fromRect(c.from));
      if (!mine && !ch.cells.some(c => inRect(c.x, c.y))) continue;
      if (!mine) ch.cells.forEach(c => { if (c.from !== undefined && c.from >= 0) goHome.push({ from: c.from, id: c.id }); });
      this.dropChunk(i);
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

  /** 拿掉第 i 块碎块（不并回地形），通知场景 */
  private dropChunk(i: number): void {
    const [ch] = this.chunks.splice(i, 1);
    ch.container.destroy();
    this.host.onChunkRemoved?.(ch);
  }

  /** 这块材料的来源格在不在这个矩形里（重置时判断东西归不归这个房间） */
  originIn(from: number | undefined, x0: number, y0: number, w: number, h: number): boolean {
    if (from === undefined || from < 0) return false;
    const x = from % this.w, y = Math.floor(from / this.w);
    return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
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
    if (i >= 0) this.dropChunk(i);
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
const NEIGHBORS8: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
