// ===== 地图迷雾：光照扩散 + 设计师迷雾区 + 半透明记忆 =====
// 三种状态：没见过（全黑）/ 见过但不在视野（半透明，能看地形看不到怪）/ 视野里（清晰）。
// 光从玩家所在格出发沿空气逐格衰减，实心格能被照亮但挡住后面；迷雾区没揭开前无论多亮都全黑，
// 玩家踏进区内任一格整区永久揭开。探索记忆随存档保存，不随死亡 / R 重置消失。
import type Phaser from 'phaser';
import type { CellRef, FogState, RoomCoord } from '@/type';
import { Tiles } from '@/game/registry/registry';

export interface FogOptions {
  tile: number;
  roomW: number;
  roomH: number;
  radius: number;
  memoryAlpha: number;
  /** 房间坐标 → 房间 key（用来组迷雾区 id 和查"无迷雾"房间） */
  keyAt(rx: number, ry: number): string | null;
  /** 不要迷雾的房间 key */
  noFogRooms: Set<string>;
}

export class FogOfWar {
  readonly w: number;
  readonly h: number;
  private explored: Uint8Array;
  private light: Float32Array;
  private revealed = new Set<string>();
  private rt: Phaser.GameObjects.RenderTexture;
  /** 笔刷对象池：每格一支硬方块、一支柔光，画的时候只改位置和透明度，然后一次性擦除（一趟渲染） */
  private squares: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private room: RoomCoord = { rx: -1, ry: -1 };
  private dirty = true;

  constructor(scene: Phaser.Scene, private grid: string[][], private zones: string[][], private opts: FogOptions, saved?: FogState) {
    this.h = grid.length; this.w = grid[0].length;
    this.explored = new Uint8Array(this.w * this.h);
    this.light = new Float32Array(this.w * this.h);
    if (saved && saved.explored.length === this.h) {
      saved.explored.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') this.explored[y * this.w + x] = 1; }));
      saved.revealedZones.forEach(z => this.revealed.add(z));
    }
    const T = opts.tile;
    this.rt = scene.add.renderTexture(0, 0, opts.roomW * T, opts.roomH * T).setOrigin(0).setDepth(12);
    for (let i = 0; i < opts.roomW * opts.roomH; i++) {
      this.squares.push(scene.make.image({ key: 'fogsquare', add: false }));
      this.glows.push(scene.make.image({ key: 'fogglow', add: false }));
    }
  }

  destroy(): void { this.rt.destroy(); this.squares.forEach(i => i.destroy()); this.glows.forEach(i => i.destroy()); }

  /** 光照传播（纯函数）：返回每格亮度 0..1。空气格传播并衰减，实心格被照亮但不再传播 */
  static computeLight(grid: string[][], sx: number, sy: number, radius: number): Float32Array {
    const h = grid.length, w = grid[0].length;
    const light = new Float32Array(w * h);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return light;
    const dist = new Int16Array(w * h).fill(-1);
    const solid = (x: number, y: number) => !!Tiles.get(grid[y][x])?.solid;
    const value = (d: number) => Math.max(0, 1 - d / (radius + 1));
    const q: number[] = [sy * w + sx];
    dist[sy * w + sx] = 0; light[sy * w + sx] = 1;
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++]; const x = i % w, y = (i - x) / w; const d = dist[i];
      if (d >= radius) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx, nd = d + 1;
        if (solid(nx, ny)) { light[ni] = Math.max(light[ni], value(nd)); continue; }   // 墙被照亮，但挡住后面
        if (dist[ni] >= 0 && dist[ni] <= nd) continue;
        dist[ni] = nd; light[ni] = Math.max(light[ni], value(nd)); q.push(ni);
      }
    }
    return light;
  }

  /** 玩家站在 (px, py) 格：重算视野、揭开迷雾区、更新记忆 */
  compute(px: number, py: number): void {
    const { w, h } = this;
    this.light = FogOfWar.computeLight(this.grid, px, py, this.opts.radius);
    // 踏进迷雾区就揭开整个区
    const z = this.zoneKey(px, py);
    if (z) this.revealed.add(z);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const key = this.opts.keyAt(Math.floor(x / this.opts.roomW), Math.floor(y / this.opts.roomH));
        if (key && this.opts.noFogRooms.has(key)) { this.light[i] = 1; this.explored[i] = 1; continue; }
        const zk = this.zoneKey(x, y);
        if (zk && !this.revealed.has(zk)) { this.light[i] = 0; continue; }   // 没揭开的区：全黑，也不记
        if (this.light[i] > 0) this.explored[i] = 1;
      }
    this.dirty = true;
  }

  private zoneKey(x: number, y: number): string | null {
    const c = this.zones[y]?.[x];
    if (!c || c === '.') return null;
    const key = this.opts.keyAt(Math.floor(x / this.opts.roomW), Math.floor(y / this.opts.roomH));
    return key ? `${key}:${c}` : null;
  }

  /** 这个格子玩家知道吗（预览、UI 用） */
  isKnown(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.explored[y * this.w + x] === 1;
  }

  setRoom(r: RoomCoord): void { this.room = r; this.dirty = true; }
  markDirty(): void { this.dirty = true; }

  /** 只在脏的时候重画：整块填黑，再在亮格 / 记忆格上按"擦除"混合擦出来 */
  draw(): void {
    if (!this.dirty || this.room.rx < 0) return;
    this.dirty = false;
    const T = this.opts.tile, { roomW, roomH } = this.opts;
    const ox = this.room.rx * roomW, oy = this.room.ry * roomH;
    this.rt.setPosition(ox * T, oy * T);
    this.rt.clear();
    this.rt.fill(0x05060c, 1);
    const memory = 1 - this.opts.memoryAlpha;
    const batch: Phaser.GameObjects.Image[] = [];
    let n = 0;
    for (let ly = 0; ly < roomH; ly++)
      for (let lx = 0; lx < roomW; lx++, n++) {
        const x = ox + lx, y = oy + ly;
        if (x >= this.w || y >= this.h) continue;
        const i = y * this.w + x;
        const l = this.light[i];
        const a = l > 0 ? Math.min(1, 0.3 + 0.7 * l) : this.explored[i] ? memory : 0;
        if (a <= 0) continue;
        const cx = lx * T + T / 2, cy = ly * T + T / 2;
        const sq = this.squares[n]; sq.setPosition(cx, cy).setAlpha(a); batch.push(sq);
        if (l > 0) { const gl = this.glows[n]; gl.setPosition(cx, cy).setAlpha(a * 0.5); batch.push(gl); }   // 往暗处晕开一点柔光
      }
    if (batch.length) this.rt.erase(batch);   // 一次调用 = 一趟渲染
  }

  toState(): FogState {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) s += this.explored[y * this.w + x] ? '1' : '0'; rows.push(s); }
    return { explored: rows, revealedZones: [...this.revealed] };
  }

  /** 给预览用：过滤掉没见过的格子 */
  filterKnown<T extends CellRef>(cells: T[]): T[] { return cells.filter(c => this.isKnown(c.x, c.y)); }
}
