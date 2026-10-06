// ===== 地形的画面：瓦片层（碰撞也挂在它上面）、投影、体积感 =====
// 网格是 Terrain 的，这里只管"某一格该画成什么"。被别处接管着画的格子（移动方块）不放瓦片
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import { Tiles } from '@/game/registry/registry';
import { AUTOTILE_VARIANTS } from '@/asset';
import { WALL_TEXTURE, WALL_VARIANTS, wallTemplates } from './walls';
import { frameAt, isWallAt, WALL_GID } from './frames';
import { depthToAirAround, shadeOf } from './shading';

const NEIGHBORS8: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class TerrainView {
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly w: number;
  private readonly h: number;
  /** 体积感（见 enableShading）：一格一个点的小图，平滑放大盖在地形上；没开是 null */
  private shade: { tex: Phaser.Textures.CanvasTexture; pixels: ImageData } | null = null;
  /** 体积感要重算的那一块（变过的格子围成的矩形）；null = 不用算 */
  private shadeDirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private static shadeCount = 0;
  /** 地形的投影（见 enableShadow）；没开是 null */
  private shadow: Phaser.Tilemaps.TilemapLayer | null = null;

  /**
   * @param grid 地形网格（共享引用，Terrain 改它这里跟着读）
   * @param drawnElsewhere 这一格由别人画（移动方块）：瓦片层不放
   */
  constructor(private readonly scene: Phaser.Scene, private readonly grid: string[][], private readonly T: number, private readonly drawnElsewhere: (x: number, y: number) => boolean) {
    this.w = grid[0].length; this.h = grid.length;
    const data = grid.map((r, y) => r.map((_, x) => frameAt(grid, x, y, 'game', this.wallAt)));
    this.map = scene.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    const walls = this.map.addTilesetImage(WALL_TEXTURE, WALL_TEXTURE, T, T, 0, 0, WALL_GID)!;   // 墙：按周围 8 格拼好的那张
    this.layer = this.map.createLayer(0, [tileset, walls], 0, 0)!;
    const collide: number[] = [];
    Tiles.filter(d => d.solid && d.gameFrame >= 0).forEach(d => { for (let k = 0; k < (d.autotile ? AUTOTILE_VARIANTS : 1); k++) collide.push(d.gameFrame + k); });
    Tiles.filter(d => d.solid && !!d.wall).forEach(d => {
      const base = WALL_GID + wallTemplates().indexOf(d.wall!) * WALL_VARIANTS.length;
      for (let k = 0; k < WALL_VARIANTS.length; k++) collide.push(base + k);
    });
    this.layer.setCollision(collide);
  }

  /** 拼墙时地图上哪些格子算墙：被别处接管着画的格子（移动方块）不算 */
  readonly wallAt = (x: number, y: number): boolean =>
    isWallAt(this.grid, x, y) && !(x >= 0 && y >= 0 && x < this.w && y < this.h && this.drawnElsewhere(x, y));

  /** 这一格变了：重画它和邻居（墙看 8 个邻居，自动拼贴的材质、会改挂法的尖刺看上下左右） */
  cellChanged(x: number, y: number): void {
    this.refreshFrame(x, y);
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      const d = Tiles.get(this.grid[ny][nx]);
      if (d?.wall || ((d?.autotile || d?.sideMount) && (dx === 0 || dy === 0))) this.refreshFrame(nx, ny);
    }
  }

  /** 这些格子重新按 drawnElsewhere 决定画不画（接管 / 交还某些格子的时候调）；旁边的墙跟着重拼 */
  refreshCells(cells: CellRef[]): void {
    cells.forEach(c => { if (c.x >= 0 && c.y >= 0 && c.x < this.w && c.y < this.h) this.cellChanged(c.x, c.y); });
  }

  private refreshFrame(x: number, y: number): void {
    const f = this.drawnElsewhere(x, y) ? -1 : frameAt(this.grid, x, y, 'game', this.wallAt);
    if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
    if (this.shadow) { if (f < 0) this.shadow.removeTileAt(x, y); else this.shadow.putTileAt(f, x, y).tint = 0x000000; }
    this.markShade(x, y, x, y);
  }

  /** 地形的体积感：实心砖越往里越暗（shading.ts），挨着空气的表面不变。砖块变化后下一帧重算 */
  enableShading(solid: (x: number, y: number) => boolean): void {
    if (this.shade) return;
    const key = `terrainshade${TerrainView.shadeCount++}`;
    const tex = this.scene.textures.createCanvas(key, this.w, this.h)!;
    this.shade = { tex, pixels: tex.context.createImageData(this.w, this.h) };
    this.scene.add.image(0, 0, key).setOrigin(0).setScale(this.T).setDepth(0.5);
    this.markShade(0, 0, this.w - 1, this.h - 1);
    this.update(solid);
  }

  /** 体积感要重算的范围扩到这块（格，含两端） */
  private markShade(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.shadeDirty;
    this.shadeDirty = d ? { x0: Math.min(d.x0, x0), y0: Math.min(d.y0, y0), x1: Math.max(d.x1, x1), y1: Math.max(d.y1, y1) } : { x0, y0, x1, y1 };
  }

  /** 每帧：体积感有变化就重算变过的那一块（不是整张图）。solid(x, y) = 这一格算实心（被别处接管着画的算空气，它们会动） */
  update(solid: (x: number, y: number) => boolean): void {
    const d = this.shadeDirty;
    if (!this.shade || !d) return;
    this.shadeDirty = null;
    const { out, depth } = depthToAirAround(this.w, this.h, (x, y) => solid(x, y) && !this.drawnElsewhere(x, y), { x: d.x0, y: d.y0, w: d.x1 - d.x0 + 1, h: d.y1 - d.y0 + 1 });
    const px = this.shade.pixels.data;
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) px[((out.y + y) * this.w + out.x + x) * 4 + 3] = Math.round(shadeOf(depth[y * out.w + x]) * 255);
    this.shade.tex.context.putImageData(this.shade.pixels, 0, 0, out.x, out.y, out.w, out.h);
    this.shade.tex.refresh();
    this.shade.tex.setFilter(0);   // Phaser.Textures.FilterMode.LINEAR：平滑放大；重新上传会按像素风设置变回 NEAREST，每次都要再设
  }

  /** 场景关闭时调：体积感的那张小图是全局的贴图，不删每换一层就多一张 */
  destroy(): void { this.shade?.tex.destroy(); this.shade = null; }

  /**
   * 地形的投影：同样的砖再画一层，往右下挪 (dx, dy) 像素、染黑、半透明，垫在地形后面 ——
   * 墙在背景上落一道硬边的影子，看着是浮在背景前面的，有层次。砖块变化时跟着一起改
   */
  enableShadow(dx: number, dy: number, alpha: number): void {
    if (this.shadow) return;
    const data = this.grid.map((r, y) => r.map((_, x) => this.layer.getTileAt(x, y)?.index ?? -1));
    const map = this.scene.make.tilemap({ data, tileWidth: this.T, tileHeight: this.T });
    const tiles = map.addTilesetImage('tiles', 'tiles', this.T, this.T, 0, 0)!;
    const walls = map.addTilesetImage(WALL_TEXTURE, WALL_TEXTURE, this.T, this.T, 0, 0, WALL_GID)!;
    this.shadow = map.createLayer(0, [tiles, walls], dx, dy)!.setAlpha(alpha).setDepth(-1);
    this.shadow.setTint(0x000000);
  }
}
