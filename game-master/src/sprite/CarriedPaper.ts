// ===== 被驮着的纸：贴在驮它的东西（怪物、玩家）头顶跟着走，每一格都是实心的（PaperBody） =====
import type Phaser from 'phaser';
import type { Chunk, ChunkCell, Terrain } from '@/game/terrain/Terrain';
import { rectHitsCells } from '@/game/core/solid';
import { PaperBody, type Carrier } from './PaperBody';

export class CarriedPaper {
  readonly container: Phaser.GameObjects.Container;
  readonly cells: ChunkCell[];
  readonly platform: PaperBody;
  private readonly minX: number;
  private readonly minY: number;
  private readonly w: number;
  private readonly h: number;
  /** 包围盒左边相对驮它的东西的 x（像素）：怪物驮着是居中在背上；玩家驮着是接住那一刻纸在哪就在哪，不挪（挪了可能挪进墙里） */
  private readonly offsetX: number;

  /**
   * @param platform 可以传飘落时用的那一块进来直接接手：碰撞体连续，站在上面的人不会漏下去
   * @param offsetX 包围盒左边相对驮它的东西的 x；不传就居中
   */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, readonly carrier: Carrier, chunk: Chunk, private readonly T: number, platform?: PaperBody, offsetX?: number) {
    this.container = chunk.container;
    this.cells = chunk.cells;
    const xs = this.cells.map(c => c.x), ys = this.cells.map(c => c.y);
    this.minX = Math.min(...xs); this.minY = Math.min(...ys);
    this.w = (Math.max(...xs) - this.minX + 1) * T; this.h = (Math.max(...ys) - this.minY + 1) * T;
    this.offsetX = offsetX ?? -this.w / 2;
    this.platform = platform ?? new PaperBody(scene, group, this.cells, T);
    this.platform.carriedBy = carrier;
    this.update();
  }

  /** 包围盒顶边贴到头顶时的 y（像素） */
  get top(): number { return this.carrier.body.top - this.h; }
  /** 包围盒左边（像素） */
  get left(): number { return this.carrier.x + this.offsetX; }

  /** 每帧贴到头顶；站在上面的人由平台带着走 */
  update(): void {
    const T = this.T;
    this.container.setPosition(this.left - this.minX * T, this.top - this.minY * T);
    this.platform.place(this.left, this.top);
  }

  /** 按驮它的东西现在的位置摆，纸会不会撞进实心格里（贴着边不算） */
  hits(solid: (cx: number, cy: number) => boolean): boolean {
    const left = this.left, top = this.top;
    return this.platform.rects().some(r => rectHitsCells(left + r.x0 + 1, left + r.x1 - 1, top + r.y0 + 1, top + r.y1 - 1, this.T, solid));
  }

  /** 驮它的东西没了（或把它撞掉了）：从上一次摆的位置继续飘落 */
  drop(terrain: Terrain, T: number): Chunk {
    const cells = this.cells.map(c => ({ ...c, x: Math.round((c.x * T + this.container.x) / T), y: Math.round((c.y * T + this.container.y) / T) }));
    this.platform.destroy();
    return terrain.addChunk(cells, this.container);
  }

  destroy(): void { this.platform.destroy(); this.container.destroy(); }
}
