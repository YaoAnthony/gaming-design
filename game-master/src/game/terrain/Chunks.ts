// ===== 碎块：失去支撑的地块整块掉下来，落地并回网格；纸慢慢飘，还可能被接住 =====
// 网格本身是 Terrain 的，这里通过 ChunkWorld 读写它；场景关心的事（掉了、落地了、接住了）走 host 回调
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import { AIR, Tiles } from '@/game/registry/registry';
import { pieceConnected, pieceTexture } from './frames';

/** from = 这块材料原本在地图上哪一格（格子序号 y * w + x）；-1 / 不写 = 不是地图原有的。房间重置按它判断材料归哪个房间 */
export interface ChunkCell extends CellRef { id: string; from?: number }
export interface Chunk { id: number; cells: ChunkCell[]; container: Phaser.GameObjects.Container; vy: number; py: number; /** >0 = 匀速飘落 */ floatSpeed: number; t: number }

/** 碎块需要地形提供的东西 */
export interface ChunkWorld {
  scene: Phaser.Scene;
  T: number;
  gravity(): { chunkGravity: number; chunkMaxFall: number };
  isSolid(x: number, y: number): boolean;
  occupied(x: number, y: number): boolean;
  /** 这一格材料的来源格 */
  originOf(x: number, y: number): number;
  /** 网格读写：碎块起飞时那些格子清空，落地时放回去 */
  set(x: number, y: number, id: string, from?: number): void;
  /** 起飞后：上面挂着的砖碎掉；落地后：重新判支撑 */
  onCellsCleared(cells: CellRef[]): void;
  onLanded(): void;
  onChunkFall?(chunk: Chunk): void;
  onChunkLand?(chunk: Chunk): void;
  catchChunk?(chunk: Chunk): boolean;
  onChunkRemoved?(chunk: Chunk): void;
}

export class Chunks {
  readonly list: Chunk[] = [];
  private nextId = 1;

  constructor(private readonly world: ChunkWorld) {}

  /** 这些格子离开网格，变成一块一起掉的碎块 */
  spawn(cells: ChunkCell[]): void {
    const { world } = this, T = world.T;
    cells.forEach(c => { c.from ??= world.originOf(c.x, c.y); world.set(c.x, c.y, AIR); });
    world.onCellsCleared(cells);
    const container = world.scene.add.container(0, 0).setDepth(5);
    const connected = pieceConnected(cells);   // 墙按这一块碎块自己里面的邻居拼（它是单独掉下来的一整块）
    cells.forEach(c => container.add(world.scene.add.image(c.x * T + T / 2, c.y * T + T / 2, ...pieceTexture(c.id, connected(c)))));
    this.push(cells, container);
  }

  /** 从外面放回来一块（比如驮着它的怪物没了），从给定格子位置继续掉 */
  add(cells: ChunkCell[], container: Phaser.GameObjects.Container): Chunk {
    const T = this.world.T;
    container.setPosition(0, 0);
    (container.list as Phaser.GameObjects.Image[]).forEach((img, k) => img.setPosition(cells[k].x * T + T / 2, cells[k].y * T + T / 2));
    return this.push(cells, container);
  }

  private push(cells: ChunkCell[], container: Phaser.GameObjects.Container): Chunk {
    const chunk: Chunk = { id: this.nextId++, cells, container, vy: 0, py: 0, floatSpeed: Tiles.get(cells[0].id)?.floatSpeed ?? 0, t: 0 };
    this.list.push(chunk);
    this.world.onChunkFall?.(chunk);
    return chunk;
  }

  /** 每帧：整体下落，任一格子下方被挡住就落地并并回格子 */
  update(dt: number): void {
    const { world } = this, T = world.T, g = world.gravity();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ch = this.list[i];
      ch.t += dt;
      ch.vy = ch.floatSpeed > 0 ? ch.floatSpeed : Math.min(ch.vy + g.chunkGravity * dt, g.chunkMaxFall);
      ch.py += ch.vy * dt;
      if (ch.floatSpeed > 0 && world.catchChunk?.(ch)) { this.list.splice(i, 1); continue; }
      // 落地判定：下面是砖块就立刻落地（以前要等 py 走满一格才检查，碎块会先陷进地里一整格再弹回来；
      // 慢慢飘的纸尤其明显，站在上面的人会被一起带进地里）。下面是另一块还在掉的碎块，就贴着它一起掉。
      let landed = false;
      for (;;) {
        if (ch.cells.some(c => world.isSolid(c.x, c.y + 1) || world.occupied(c.x, c.y + 1))) { landed = true; break; }
        const below = this.below(ch);
        if (below) {
          // 下面是另一块还在掉的碎块：贴着它一起掉（不超过它、不比它快），等它落地了自己再落地。不能在半空并进地形
          if (ch.py > below.py) ch.py = below.py;
          ch.vy = Math.min(ch.vy, below.vy);
          break;
        }
        if (ch.py < T) break;
        ch.cells.forEach(c => { c.y += 1; });
        ch.py -= T;
      }
      if (landed) {
        ch.py = 0;
        ch.container.destroy();
        ch.cells.forEach(c => world.set(c.x, c.y, c.id, c.from ?? -1));
        this.list.splice(i, 1);
        world.onChunkLand?.(ch);
        world.onLanded();
      } else {
        ch.container.y = ch.py;
        ch.container.x = ch.floatSpeed > 0 ? Math.sin(ch.t * 2.5) * 4 : 0;   // 飘落时左右轻晃
        (ch.container.list as Phaser.GameObjects.Image[]).forEach((img, k) => { img.y = ch.cells[k].y * T + T / 2; });
      }
    }
  }

  /** 紧贴在这块碎块下面的另一块碎块（它的某一格正下方是那一块的格子） */
  private below(ch: Chunk): Chunk | undefined {
    return this.list.find(o => o !== ch && ch.cells.some(c => o.cells.some(d => d.x === c.x && d.y === c.y + 1)));
  }

  /** 拿掉第 i 块（不并回地形），通知场景 */
  dropAt(i: number): void {
    const [ch] = this.list.splice(i, 1);
    ch.container.destroy();
    this.world.onChunkRemoved?.(ch);
  }

  /** 直接拿掉一块正在下落的碎块（比如被 Boss 吞了），不并回地形 */
  remove(ch: Chunk): void {
    const i = this.list.indexOf(ch);
    if (i >= 0) this.dropAt(i);
  }

  /** 碎块当前在世界里的包围盒（含下落的小数偏移和飘落的左右晃动） */
  bounds(ch: Chunk): { x: number; y: number; w: number; h: number } {
    const T = this.world.T;
    const xs = ch.cells.map(c => c.x), ys = ch.cells.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX * T + ch.container.x, y: minY * T + ch.py, w: (maxX - minX + 1) * T, h: (maxY - minY + 1) * T };
  }

  forEachCell(fn: (ch: Chunk, px: number, py: number, w: number, h: number) => void): void {
    const T = this.world.T;
    this.list.forEach(ch => ch.cells.forEach(c => fn(ch, c.x * T, c.y * T + ch.py, T, T)));
  }
}
