// ===== 钥匙与门：拿着钥匙贴到同色的门上，这一组的门全部消失，钥匙用掉 =====
// 开过的门死亡重置也不会关回来。门在建地形前烘成 % 砖（bake），这里按组染色。
import { DOOR_CHAR, lockGroup, type LockCell } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { keyCarryable, type Carry } from '../carry/Carry';

export interface LockData { doors: LockCell[]; keys: LockCell[] }

/** 贴多近（像素）算碰到门 */
const TOUCH_PX = 3;

export class Locks implements Mechanic {
  private opened = new Set<number>();

  constructor(private ctx: PlayContext, private data: LockData) {}

  private get carry(): Carry | undefined { return this.ctx.mech<Carry>('carry'); }
  private color(group: number): number { return lockGroup(this.ctx.model, group)?.color ?? 0xffffff; }
  private isDoor(c: LockCell): boolean { return this.ctx.terrain.grid[c.y]?.[c.x] === DOOR_CHAR; }

  start(): void {
    const T = this.ctx.cfg.tile;
    this.data.keys.forEach(c => this.carry?.spawnGround(keyCarryable(c.group, this.color(c.group)), c.x * T + T / 2, c.y * T + T / 2));
    this.tint();
  }

  /** 手里是钥匙、贴着同组的门 → 开这一组 */
  updateAlive(): void {
    const key = this.carry?.holding?.key;
    if (key === undefined || !this.data.doors.length) return;
    const r = this.ctx.player.rect(), T = this.ctx.cfg.tile;
    const x0 = Math.floor((r.left - TOUCH_PX) / T), x1 = Math.floor((r.right + TOUCH_PX) / T), y0 = Math.floor((r.top - TOUCH_PX) / T), y1 = Math.floor((r.bottom + TOUCH_PX) / T);
    const door = this.data.doors.find(c => c.group === key && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 && this.isDoor(c));
    if (door) this.open(door.group);
  }

  /** 重置把门放回来了：开过的组再拿掉，颜色再染一遍 */
  onReset(): void {
    this.opened.forEach(g => {
      const cells = this.data.doors.filter(c => c.group === g && this.isDoor(c));
      if (cells.length) this.ctx.terrain.destroyCellsForce(cells);
    });
    this.tint();
  }

  /** 门砖是白底，按组乘上颜色 */
  private tint(): void {
    this.data.doors.forEach(c => {
      if (!this.isDoor(c)) return;
      const t = this.ctx.terrain.layer.getTileAt(c.x, c.y);
      if (t) t.tint = this.color(c.group);
    });
  }

  /** 一把钥匙开一组门：这组所有门格消失，钥匙用掉 */
  private open(group: number): void {
    const { ctx } = this, T = ctx.cfg.tile;
    this.carry?.consume();
    this.opened.add(group);
    const cells = this.data.doors.filter(c => c.group === group && this.isDoor(c));
    cells.forEach(c => ctx.sparks.explode(6, c.x * T + T / 2, c.y * T + T / 2));
    ctx.terrain.destroyCellsForce(cells);
    ctx.scene.cameras.main.shake(120, 0.004);
    ctx.fx.fogDirty();
  }
}
