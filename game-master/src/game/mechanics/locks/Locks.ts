// ===== 钥匙与门：拿着钥匙碰到同色的门，这扇门打开，并且沿相邻的同色门一格格连锁打开，钥匙用掉 =====
// 连锁只沿上下左右相邻、同色的门传：同色但不相连的另一片门还锁着，要另一把钥匙。传一格的间隔是 config.lockChainDelayMs。
// 开过的门死亡重置也不会关回来。门在建地形前烘成 % 砖（bake），这里按组染色。
import type Phaser from 'phaser';
import { DOOR_CHAR, lockGroup, type LockCell } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { keyCarryable, type Carry } from '../carry/Carry';
import { doorCluster, type DoorHop } from './cluster';

export interface LockData { doors: LockCell[]; keys: LockCell[] }

/** 贴多近（像素）算碰到门 */
const TOUCH_PX = 3;

export class Locks implements Mechanic {
  /** 开过的门（格子序号）：重置时放回来的门要再拿掉。连锁一开始整片就记上，传到一半重置也算开了 */
  private opened = new Set<number>();
  /** 连锁还没传到的那几格 */
  private pending: Phaser.Time.TimerEvent[] = [];

  constructor(private ctx: PlayContext, private data: LockData) {}

  private get carry(): Carry | undefined { return this.ctx.mech<Carry>('carry'); }
  private color(group: number): number { return lockGroup(this.ctx.model, group)?.color ?? 0xffffff; }
  private isDoor(c: LockCell): boolean { return this.ctx.terrain.grid[c.y]?.[c.x] === DOOR_CHAR; }
  private index(c: LockCell): number { return c.y * this.ctx.terrain.w + c.x; }

  start(): void {
    const T = this.ctx.cfg.tile;
    this.data.keys.forEach(c => this.carry?.spawnGround(keyCarryable(c.group, this.color(c.group)), c.x * T + T / 2, c.y * T + T / 2));
    this.tint();
  }

  /** 手里是钥匙、贴着同色的一扇门 → 从这扇门开始连锁打开 */
  updateAlive(): void {
    const key = this.carry?.holding?.key;
    if (key === undefined || !this.data.doors.length) return;
    const r = this.ctx.player.rect(), T = this.ctx.cfg.tile;
    const x0 = Math.floor((r.left - TOUCH_PX) / T), x1 = Math.floor((r.right + TOUCH_PX) / T), y0 = Math.floor((r.top - TOUCH_PX) / T), y1 = Math.floor((r.bottom + TOUCH_PX) / T);
    const touching = this.data.doors.filter(c => c.group === key && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 && this.isDoor(c) && !this.opened.has(this.index(c)));
    if (!touching.length) return;
    // 同时擦到好几扇（比如身体跨两行）：从离身体中心最近的那扇开始传，连锁看起来是从碰的地方散开的
    const cx = r.centerX / T - 0.5, cy = r.centerY / T - 0.5;
    const door = touching.reduce((a, b) => ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (a.x - cx) ** 2 + (a.y - cy) ** 2 ? b : a));
    this.open(door);
  }

  /** 重置前：还没传到的连锁不用再等，重置之后一次拿掉 */
  onClear(): void { this.cancelPending(); }

  /** 重置把门放回来了：开过的门（包括连锁传到一半的）再拿掉，颜色再染一遍 */
  onReset(): void {
    const cells = this.data.doors.filter(c => this.opened.has(this.index(c)) && this.isDoor(c));
    if (cells.length) this.ctx.terrain.destroyCellsForce(cells);
    this.tint();
  }

  destroy(): void { this.cancelPending(); }

  /** 门砖是白底，按组乘上颜色 */
  private tint(): void {
    this.data.doors.forEach(c => {
      if (!this.isDoor(c)) return;
      const t = this.ctx.terrain.layer.getTileAt(c.x, c.y);
      if (t) t.tint = this.color(c.group);
    });
  }

  /** 钥匙用掉；碰到的门立刻开，相连的同色门按跳数一格格跟着开 */
  private open(start: LockCell): void {
    const { ctx } = this;
    const cluster = doorCluster(this.data.doors, start, c => this.isDoor(c) && !this.opened.has(this.index(c)));
    if (!cluster.length) return;
    this.carry?.consume();
    cluster.forEach(c => this.opened.add(this.index(c)));
    ctx.scene.cameras.main.shake(120, 0.004);
    const byHop = new Map<number, DoorHop[]>();
    cluster.forEach(c => { const g = byHop.get(c.hop) ?? []; g.push(c); byHop.set(c.hop, g); });
    byHop.forEach((cells, hop) => {
      if (hop === 0) { this.vanish(cells); return; }
      const timer: Phaser.Time.TimerEvent = ctx.scene.time.delayedCall(hop * ctx.cfg.lockChainDelayMs, () => {
        this.pending = this.pending.filter(t => t !== timer);
        this.vanish(cells);
      });
      this.pending.push(timer);
    });
  }

  /** 这几扇门消失：火花 + 一块门颜色的光放大淡出 */
  private vanish(cells: LockCell[]): void {
    const { ctx } = this, T = ctx.cfg.tile;
    const still = cells.filter(c => this.isDoor(c));
    if (!still.length) return;
    still.forEach(c => {
      const x = c.x * T + T / 2, y = c.y * T + T / 2;
      ctx.sparks.explode(6, x, y);
      const glow = ctx.scene.add.rectangle(x, y, T, T, this.color(c.group), 0.85).setDepth(9).setBlendMode('ADD');
      ctx.scene.tweens.add({ targets: glow, scale: 1.6, alpha: 0, duration: 260, ease: 'Quad.out', onComplete: () => glow.destroy() });
    });
    ctx.terrain.destroyCellsForce(still);
    ctx.fx.fogDirty();
  }

  private cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = [];
  }
}
