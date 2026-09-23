// ===== 被怪物驮着的纸：跟着怪物走，是一块只能从上面踩的平台 =====
import type Phaser from 'phaser';
import type { Chunk, ChunkCell, Terrain } from '@/game/terrain/Terrain';
import type { Enemy } from './Enemy';
import { TopPlatform } from './TopPlatform';

export class CarriedPaper {
  readonly container: Phaser.GameObjects.Container;
  readonly cells: ChunkCell[];
  readonly platform: TopPlatform;
  private readonly anchorX: number;
  private readonly anchorBottom: number;
  private readonly w: number;
  private readonly h: number;

  /** platform 可以传飘落时用的那一块进来直接接手：碰撞体连续，站在上面的人不会漏下去 */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, readonly enemy: Enemy, chunk: Chunk, T: number, platform?: TopPlatform) {
    this.container = chunk.container;
    this.cells = chunk.cells;
    const xs = this.cells.map(c => c.x), ys = this.cells.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    this.w = (maxX - minX + 1) * T; this.h = (maxY - minY + 1) * T;
    this.anchorX = ((minX + maxX + 1) / 2) * T;
    this.anchorBottom = (maxY + 1) * T;
    this.platform = platform ?? new TopPlatform(scene, group, this.w, this.h);
    this.update(0);
  }

  /** 每帧贴到怪物头顶 */
  update(dt: number): void {
    const left = this.enemy.x - this.w / 2, top = this.enemy.body.top - this.h;
    this.container.setPosition(this.enemy.x - this.anchorX, this.enemy.body.top - this.anchorBottom);
    this.platform.place(left, top, this.w, this.h, dt);
  }

  /** 怪物没了：从当前位置继续飘落 */
  drop(terrain: Terrain, T: number): void {
    const cells = this.cells.map(c => ({ ...c, x: Math.round((c.x * T + this.container.x) / T), y: Math.round((c.y * T + this.container.y) / T) }));
    this.platform.destroy();
    terrain.addChunk(cells, this.container);
  }

  destroy(): void { this.platform.destroy(); this.container.destroy(); }
}
