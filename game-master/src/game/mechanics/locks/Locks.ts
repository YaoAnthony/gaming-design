// ===== 钥匙与门：钥匙碰到同色的门，这扇门打开，并且沿相邻的同色门一格格连锁打开，钥匙用掉 =====
// 开门的是钥匙本身，不管它在哪：拿在手上的（人碰到门就算）、地上的、正在往下掉的、被怪物推着走的都一样。
// 连锁只沿上下左右相邻、同色的门传：同色但不相连的另一片门还锁着，要另一把钥匙。传一格的间隔是 config.lockChainDelayMs。
// 整张地图重置（死亡 / R）：开过的门全部关回来，用掉的、没动过的钥匙回到原位；拿在手上的还拿在手上，
// 人自己丢下的留在丢下的地方。进入下一关全部回原位。只重置房间时开过的门不关。
// 门在建地形前烘成 % 砖（bake），这里按组染色。门可以盖在别的砖上（比如尖刺）：开门后那一格露出底下的砖，不是空气。
import type Phaser from 'phaser';
import { DOOR_CHAR, lockGroup, type LockCell } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { keyCarryable, type Carry } from '../carry/Carry';
import { doorCluster, touchedDoor, type DoorHop } from './cluster';

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
    this.spawnKeys();
    this.tint();
  }

  /** 每一把钥匙贴着同色的一扇门 → 从这扇门开始连锁打开，这把钥匙用掉 */
  updateAlive(): void {
    if (!this.data.doors.length) return;
    const T = this.ctx.cfg.tile, locked = (c: LockCell) => this.isDoor(c) && !this.opened.has(this.index(c));
    for (const key of this.carry?.keysInPlay() ?? []) {
      const door = touchedDoor(this.data.doors, key.group, key.area, T, TOUCH_PX, locked);
      if (door && this.open(door)) key.use();
    }
  }

  /** 重置前：还没传到的连锁不用再等，重置之后一次拿掉 */
  onClear(): void { this.cancelPending(); }

  /**
   * 重置把门放回来了。整张地图（死亡 / R）：门就这样关着，钥匙回原位，手上拿着的、人丢下的不动；下一关：全部回原位；
   * 只重置房间：开过的门（包括连锁传到一半的）再拿掉
   */
  onReset(scope: 'room' | 'world' | 'level'): void {
    if (scope !== 'room') {
      this.opened.clear();
      this.spawnKeys(this.carry?.clearKeys(scope === 'world'));
      this.tint();
      return;
    }
    const cells = this.data.doors.filter(c => this.opened.has(this.index(c)) && this.isDoor(c));
    if (cells.length) this.reveal(cells);
    this.tint();
  }

  destroy(): void { this.cancelPending(); }

  /** 地图上的钥匙放到原位；kept = 还留着的那几把（手上的、人丢下的，第几把），它们不放 */
  private spawnKeys(kept?: Set<number>): void {
    const T = this.ctx.cfg.tile;
    this.data.keys.forEach((c, i) => {
      if (kept?.has(i)) return;
      this.carry?.spawnGround(keyCarryable(c.group, this.color(c.group), i), c.x * T + T / 2, c.y * T + T / 2);
    });
  }

  /** 门砖是白底，按组乘上颜色 */
  private tint(): void {
    this.data.doors.forEach(c => {
      if (!this.isDoor(c)) return;
      const t = this.ctx.terrain.layer.getTileAt(c.x, c.y);
      if (t) t.tint = this.color(c.group);
    });
  }

  /** 碰到的门立刻开，相连的同色门按跳数一格格跟着开；开了返回 true（钥匙由调用方用掉） */
  private open(start: LockCell): boolean {
    const { ctx } = this;
    const cluster = doorCluster(this.data.doors, start, c => this.isDoor(c) && !this.opened.has(this.index(c)));
    if (!cluster.length) return false;
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
    return true;
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
    this.reveal(still);
    ctx.fx.fogDirty();
  }

  /** 门拿掉：先当成空出来（掉落、挂着的东西照常判），门后面藏着砖的再把那块砖放回去（比如露出尖刺） */
  private reveal(cells: LockCell[]): void {
    const t = this.ctx.terrain;
    t.destroyCellsForce(cells);
    cells.forEach(c => { if (c.under) t.set(c.x, c.y, c.under); });
  }

  private cancelPending(): void {
    this.pending.forEach(t => t.remove(false));
    this.pending = [];
  }
}
