// ===== 引线层：叠在地形之上的一条线，不占格子、不挡人 =====
// 只有两端（同类邻居 ≤ 1）能被爆炸点燃；点燃后从那一头沿引线一格格烧到另一头，
// 烧到哪一格就把那一格的地形炸掉，岩石也炸（引线比起跳爆炸强），经过空气就只是过一下。
// 游戏里只画端点（黄色节点），中间段完全不可见；编辑器里整条线都显示。
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';

export interface FuseOptions { tile: number; delayMs: number }
export interface FuseCell extends CellRef { hop: number }

export class FuseNet {
  readonly w: number;
  readonly h: number;
  private cells: Uint8Array;
  private readonly original: Uint8Array;
  private nodes = new Map<number, Phaser.GameObjects.Image>();
  /** 还没烧到的那几跳（重置时要取消，不然会在恢复后的地形上继续炸） */
  private pending: Phaser.Time.TimerEvent[] = [];

  constructor(private scene: Phaser.Scene, rows: string[], private opts: FuseOptions, saved?: string[]) {
    this.h = rows.length; this.w = rows[0]?.length ?? 0;
    this.original = new Uint8Array(this.w * this.h);
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'W') this.original[y * this.w + x] = 1; }));
    this.cells = this.original.slice();
    if (saved && saved.length === this.h) {
      this.cells.fill(0);
      saved.forEach((r, y) => [...r].forEach((c, x) => { if (c === '1') this.cells[y * this.w + x] = 1; }));
    }
    this.refreshNodes();
  }

  destroy(): void { this.nodes.forEach(n => n.destroy()); this.nodes.clear(); }

  has(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.cells[y * this.w + x] === 1; }

  // ---- 纯函数（单测用）----
  static neighbours(cells: Uint8Array, w: number, h: number, x: number, y: number): number {
    let n = 0;
    for (const [dx, dy] of NEIGHBORS) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[ny * w + nx]) n++; }
    return n;
  }
  static isEnd(cells: Uint8Array, w: number, h: number, x: number, y: number): boolean {
    return !!cells[y * w + x] && FuseNet.neighbours(cells, w, h, x, y) <= 1;
  }
  /** 从点燃的端点出发沿引线 BFS，带跳数 */
  static plan(cells: Uint8Array, w: number, h: number, starts: CellRef[]): FuseCell[] {
    const seen = new Uint8Array(w * h);
    const out: FuseCell[] = [];
    const q: FuseCell[] = [];
    starts.forEach(s => { const i = s.y * w + s.x; if (cells[i] && !seen[i]) { seen[i] = 1; const c = { x: s.x, y: s.y, hop: 0 }; out.push(c); q.push(c); } });
    let qi = 0;
    while (qi < q.length) {
      const c = q[qi++];
      for (const [dx, dy] of NEIGHBORS) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        if (!cells[i] || seen[i]) continue;
        seen[i] = 1;
        const n = { x: nx, y: ny, hop: c.hop + 1 }; out.push(n); q.push(n);
      }
    }
    return out;
  }
  /** 半径内的端点（按格心距离） */
  static endsNear(cells: Uint8Array, w: number, h: number, center: CellRef, radius: number): CellRef[] {
    const out: CellRef[] = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx, y = center.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (dx * dx + dy * dy <= radius * radius && FuseNet.isEnd(cells, w, h, x, y)) out.push({ x, y });
    }
    return out;
  }

  isEnd(x: number, y: number): boolean { return this.has(x, y) && FuseNet.isEnd(this.cells, this.w, this.h, x, y); }
  endsNear(center: CellRef, radius: number): CellRef[] { return FuseNet.endsNear(this.cells, this.w, this.h, center, radius); }

  /** 点燃：返回会烧到的格子数；烧的过程按跳数错峰，每烧一跳调用 onBurn */
  ignite(starts: CellRef[], terrain: Terrain, onBurn?: (cells: CellRef[]) => void): number {
    const planned = FuseNet.plan(this.cells, this.w, this.h, starts);
    if (!planned.length) return 0;
    const groups = new Map<number, FuseCell[]>();
    planned.forEach(c => { const g = groups.get(c.hop) ?? []; g.push(c); groups.set(c.hop, g); });
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([hop, group]) => {
      const burn = () => {
        group.forEach(c => { this.cells[c.y * this.w + c.x] = 0; });
        terrain.destroyCellsForce(group);     // 烧到哪格炸哪格，岩石也炸
        terrain.shake(group, 0);              // 周围的脆岩松脱（经过空气也算爆炸）
        this.refreshNodes();
        onBurn?.(group);
      };
      if (hop === 0) burn(); else this.pending.push(this.scene.time.delayedCall(hop * this.opts.delayMs, burn));
    });
    this.pending = this.pending.filter(t => !t.hasDispatched);
    return planned.length;
  }

  /** 取消所有还在路上的燃烧 */
  cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = [];
  }

  /** 房间重置：矩形内恢复成初始引线 */
  resetRect(x0: number, y0: number, w: number, h: number, keep?: (x: number, y: number) => boolean): void {
    this.cancelPending();
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || keep?.(x, y)) continue;
      this.cells[y * this.w + x] = this.original[y * this.w + x];
    }
    this.refreshNodes();
  }

  /** 游戏里只画端点 */
  private refreshNodes(): void {
    const T = this.opts.tile;
    const want = new Set<number>();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (FuseNet.isEnd(this.cells, this.w, this.h, x, y)) want.add(y * this.w + x);
    this.nodes.forEach((img, i) => { if (!want.has(i)) { img.destroy(); this.nodes.delete(i); } });
    want.forEach(i => {
      if (this.nodes.has(i)) return;
      const x = i % this.w, y = (i - x) / this.w;
      this.nodes.set(i, this.scene.add.image(x * T + T / 2, y * T + T / 2, 'fusenode').setDepth(6));
    });
  }

  toState(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) s += this.cells[y * this.w + x] ? '1' : '0'; rows.push(s); }
    return rows;
  }
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
