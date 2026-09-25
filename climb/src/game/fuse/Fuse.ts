// ===== 引线层：叠在地形之上的一条线，不占格子、不挡人 =====
// 只有两端（同色邻居 ≤ 1）能被爆炸点燃；点燃后从那一头沿引线一格格烧到另一头，
// 烧到哪一格就烧那一格的地形（岩石裂成碎岩，紫色引线直接烧没；其它实心的烧没），经过空气就只是过一下。
// 游戏里只画端点（黄色节点），中间段完全不可见；编辑器里整条线都显示。
//
// 颜色（通道，见 channels.ts）：每一格存一个位掩码，每种颜色是一张独立的网。
// 连通、端点、点燃、燃烧、锁住全都按颜色分开算：交叉的两种颜色互不连通、互不引爆，
// 一种颜色烧过交叉点，只清掉自己那一位，另一种颜色的引线还在（之后照样能烧，比如把碎岩再烧一次）。
import Phaser from 'phaser';
import type { CellRef } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import { decodeFuse, encodeFuseState, FUSE_CHANNELS, fuseBit } from './channels';

export interface FuseOptions { tile: number; delayMs: number }
/** 某种颜色引线上的一格 */
export interface FuseEnd extends CellRef { ch: number }
/** BFS 的结果：一格和它离起点的跳数 */
export interface FuseHop extends CellRef { hop: number }

const CHANNELS = FUSE_CHANNELS.map(c => c.id);

export class FuseNet {
  readonly w: number;
  readonly h: number;
  /** 每格的颜色位掩码（当前状态，烧掉的位清零） */
  private cells: Uint8Array;
  private readonly original: Uint8Array;
  /** 已经排上燃烧计划、还没烧到的位：再点一次不会重复烧（重复烧会把碎岩直接烧没） */
  private claimed: Uint8Array;
  /** 锁住的端点（比如接在压板上的那一头），key = 格子序号 * 8 + 颜色 */
  private locked = new Set<number>();
  /** 游戏里画出来的引线头，key = 格子序号 */
  private nodes = new Map<number, NodeGfx>();
  /** 还没烧到的那几跳（重置时要取消，不然会在恢复后的地形上继续炸） */
  private pending: Phaser.Time.TimerEvent[] = [];

  constructor(private scene: Phaser.Scene, rows: string[], private opts: FuseOptions, saved?: string[]) {
    this.h = rows.length; this.w = rows[0]?.length ?? 0;
    this.original = FuseNet.parse(rows, this.w, this.h);
    this.cells = saved && saved.length === this.h ? FuseNet.parse(saved, this.w, this.h) : this.original.slice();
    this.claimed = new Uint8Array(this.w * this.h);
    this.refreshNodes();
  }

  destroy(): void { this.nodes.forEach(destroyNode); this.nodes.clear(); }

  /** 这一格有没有引线（ch 不给 = 任何颜色） */
  has(x: number, y: number, ch?: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const m = this.cells[y * this.w + x];
    return ch === undefined ? m !== 0 : (m & fuseBit(ch)) !== 0;
  }

  // ---- 纯函数（单测用）。cells 是位掩码，bit 选颜色；默认 bit = 1（0 号色，也就是 0/1 数组）----
  static parse(rows: string[], w: number, h: number): Uint8Array {
    const out = new Uint8Array(w * h);
    rows.forEach((r, y) => { if (y < h) [...r].forEach((c, x) => { if (x < w) out[y * w + x] = decodeFuse(c); }); });
    return out;
  }
  static neighbours(cells: Uint8Array, w: number, h: number, x: number, y: number, bit = 1): number {
    let n = 0;
    for (const [dx, dy] of NEIGHBORS) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[ny * w + nx] & bit) n++; }
    return n;
  }
  static isEnd(cells: Uint8Array, w: number, h: number, x: number, y: number, bit = 1): boolean {
    return !!(cells[y * w + x] & bit) && FuseNet.neighbours(cells, w, h, x, y, bit) <= 1;
  }
  /** 从点燃的格子出发沿同色引线 BFS，带跳数 */
  static plan(cells: Uint8Array, w: number, h: number, starts: CellRef[], bit = 1): FuseHop[] {
    const seen = new Uint8Array(w * h);
    const out: FuseHop[] = [];
    starts.forEach(s => {
      if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) return;
      const i = s.y * w + s.x;
      if (cells[i] & bit && !seen[i]) { seen[i] = 1; out.push({ x: s.x, y: s.y, hop: 0 }); }
    });
    for (let qi = 0; qi < out.length; qi++) {
      const c = out[qi];
      for (const [dx, dy] of NEIGHBORS) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        if (!(cells[i] & bit) || seen[i]) continue;
        seen[i] = 1;
        out.push({ x: nx, y: ny, hop: c.hop + 1 });
      }
    }
    return out;
  }
  /** 半径内同色的端点（按格心距离） */
  static endsNear(cells: Uint8Array, w: number, h: number, center: CellRef, radius: number, bit = 1): CellRef[] {
    const out: CellRef[] = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx, y = center.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (dx * dx + dy * dy <= radius * radius && FuseNet.isEnd(cells, w, h, x, y, bit)) out.push({ x, y });
    }
    return out;
  }

  // ---- 端点 ----
  private lockKey(x: number, y: number, ch: number): number { return (y * this.w + x) * 8 + ch; }

  /** 锁住这些端点：不画引线头，爆炸 / 火花点不着，只有机关（includeLocked）才能点 */
  lockEnds(ends: FuseEnd[]): void { ends.forEach(e => this.locked.add(this.lockKey(e.x, e.y, e.ch))); this.refreshNodes(); }

  private endOk(x: number, y: number, ch: number, includeLocked: boolean): boolean {
    return FuseNet.isEnd(this.cells, this.w, this.h, x, y, fuseBit(ch)) && (includeLocked || !this.locked.has(this.lockKey(x, y, ch)));
  }

  /** 这一格上是端点的那些颜色 */
  endsAt(x: number, y: number, includeLocked = false): FuseEnd[] {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [];
    return CHANNELS.filter(ch => this.endOk(x, y, ch, includeLocked)).map(ch => ({ x, y, ch }));
  }

  /** 半径内所有颜色的端点 */
  endsNear(center: CellRef, radius: number, includeLocked = false): FuseEnd[] {
    return CHANNELS.flatMap(ch => FuseNet.endsNear(this.cells, this.w, this.h, center, radius, fuseBit(ch))
      .filter(c => includeLocked || !this.locked.has(this.lockKey(c.x, c.y, ch)))
      .map(c => ({ x: c.x, y: c.y, ch })));
  }

  // ---- 燃烧 ----
  /**
   * 点燃：每种颜色从它自己的起点出发、只沿自己的颜色烧。返回会烧到的格子数（0 = 什么都没点着）。
   * 已经在烧的部分不会再排一次：火从两头烧过来会在中间碰头，每格只烧一次。
   * 每烧一跳：清掉这一格的这一种颜色，烧地形，然后调用 onBurn（带颜色）。
   */
  ignite(starts: FuseEnd[], terrain: Terrain, onBurn?: (cells: FuseEnd[]) => void): number {
    const free = this.cells.map((m, i) => m & ~this.claimed[i]);   // 还没排上计划的位
    let total = 0;
    CHANNELS.forEach(ch => {
      const bit = fuseBit(ch), shatter = !!FUSE_CHANNELS[ch].shatter;
      const planned = FuseNet.plan(free, this.w, this.h, starts.filter(s => s.ch === ch), bit);
      if (!planned.length) return;
      total += planned.length;
      planned.forEach(c => { this.claimed[c.y * this.w + c.x] |= bit; });
      const byHop = new Map<number, FuseEnd[]>();
      planned.forEach(c => { const g = byHop.get(c.hop) ?? []; g.push({ x: c.x, y: c.y, ch }); byHop.set(c.hop, g); });
      byHop.forEach((group, hop) => {
        const burn = () => {
          group.forEach(c => { const i = c.y * this.w + c.x; this.cells[i] &= ~bit; this.claimed[i] &= ~bit; });
          terrain.burnCells(group, shatter);   // 烧到哪格烧哪格：岩石裂成碎岩（紫色直接烧没），其它实心的烧没
          terrain.shake(group, 0);    // 周围的脆岩松脱（经过空气也算爆炸）
          this.refreshNodes();
          onBurn?.(group);
        };
        if (hop === 0) burn(); else this.pending.push(this.scene.time.delayedCall(hop * this.opts.delayMs, burn));
      });
    });
    this.pending = this.pending.filter(t => !t.hasDispatched);
    return total;
  }

  /** 取消所有还在路上的燃烧（排上计划没烧到的位也一起放掉） */
  cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = [];
    this.claimed.fill(0);
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

  /**
   * 游戏里只画端点；一格里只要有一种颜色是没锁住的端点就画（压板上的端点压板自己画）。
   * 默认都是同一个小黄点；这一格的端点里有设了 node 的颜色（紫色）就画成那种特别的样子。
   * 同一格的样子变了（比如交叉的紫线烧完了、只剩橙色端点）就拆掉重画。
   */
  private refreshNodes(): void {
    const want = new Map<number, number>();   // 格子序号 → 样子（-1 = 普通；其它 = 用哪个颜色的 node）
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.cells[y * this.w + x]) continue;
      const ends = CHANNELS.filter(ch => this.endOk(x, y, ch, false));
      if (!ends.length) continue;
      want.set(y * this.w + x, ends.find(ch => FUSE_CHANNELS[ch].node) ?? -1);
    }
    this.nodes.forEach((n, i) => { if (want.get(i) !== n.style) { destroyNode(n); this.nodes.delete(i); } });
    want.forEach((style, i) => { if (!this.nodes.has(i)) this.nodes.set(i, this.makeNode(i, style)); });
  }

  private makeNode(i: number, style: number): NodeGfx {
    const T = this.opts.tile, scene = this.scene;
    const x = (i % this.w) * T + T / 2, y = Math.floor(i / this.w) * T + T / 2;
    const img = scene.add.image(x, y, 'fusenode').setDepth(6);
    const look = style >= 0 ? FUSE_CHANNELS[style].node : undefined;
    if (!look) return { style, objs: [img], tweens: [] };
    // 特别的引线头：放大 + 一胀一缩，后面一圈加亮混合的光晕跟着呼吸，往上冒火星
    img.setScale(look.scale);
    const halo = scene.add.circle(x, y, T * 0.55, look.glow, 0.35).setDepth(5.9).setBlendMode('ADD');
    const embers = scene.add.particles(x, y, 'spark', {
      tint: look.glow, blendMode: 'ADD', lifespan: 750, frequency: 140, quantity: 1,
      speed: { min: 12, max: 34 }, angle: { min: 245, max: 295 },
      scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, T * 0.25), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(5.95);
    const tweens = [
      scene.tweens.add({ targets: img, scale: look.scale * 1.15, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
      scene.tweens.add({ targets: halo, scale: 1.35, alpha: 0.12, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
    ];
    return { style, objs: [img, halo, embers], tweens };
  }

  /** 存档：每格一位十六进制（颜色位掩码） */
  toState(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) s += encodeFuseState(this.cells[y * this.w + x]); rows.push(s); }
    return rows;
  }
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 一个画出来的引线头：style = -1 普通，其它 = 用哪个颜色的 node 样子 */
interface NodeGfx { style: number; objs: Phaser.GameObjects.GameObject[]; tweens: Phaser.Tweens.Tween[] }

function destroyNode(n: NodeGfx): void {
  n.tweens.forEach(t => t.remove());
  n.objs.forEach(o => o.destroy());
}
