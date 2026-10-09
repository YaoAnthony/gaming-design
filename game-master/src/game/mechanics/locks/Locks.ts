// ===== 钥匙与门：钥匙碰到同色的门，这扇门打开，并且沿相邻的同色门一格格连锁打开，钥匙用掉 =====
// 开门的是钥匙本身，不管它在哪：拿在手上的（人碰到门就算）、地上的、正在往下掉的、被怪物推着走的都一样。
// 连锁只沿上下左右相邻、同色的门传：同色但不相连的另一片门还锁着，要另一把钥匙。传一格的间隔是 config.lockChainDelayMs。
// 整张地图重置：开过的门全部关回来，用掉的、没动过的钥匙回到原位；拿在手上的还拿在手上，
// 人自己丢下的留在丢下的地方。进入下一关全部回原位。
// 只重置房间（R、Boss 战打到一半死了）：这个房间里开过的门关回来，开这些门用掉的钥匙回到原位（不管是从哪个房间带来的，
// 不然门关了钥匙没了就卡死）；别的房间的门不动，用在别的房间的钥匙也不回来（不然能刷出两把）。
// 房间解开了（core/Solves.ts）：这个房间里开过的门就一直开着，开它们用掉的钥匙不再回来（重置整张地图也不回来）。
// 门在建地形前烘成 % 砖（bake），这里按组染色。门可以盖在别的砖上（比如尖刺）：开门后那一格露出底下的砖，不是空气。
// 每扇门（连在一起的同色门）正中盖一个大锁孔（keyhole.png）：门开了就收起来，门关回来再放出来。
import type Phaser from 'phaser';
import { DEPTH } from '@/game/depth';
import type { RoomCoord } from '@/type';
import { DOOR_CHAR, lockGroup, type LockCell } from '@/game/mechanics/locks/model';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { keyCarryable, MAX_KEYS, type Carry } from '../carry/Carry';
import { doorCluster, touchedDoor, type DoorHop } from './cluster';

export interface LockData { doors: LockCell[]; keys: LockCell[] }

/** 贴多近（像素）算碰到门 */
const TOUCH_PX = 3;

export class Locks implements Mechanic {
  /** 开过的门（格子序号）：重置时放回来的门要再拿掉。连锁一开始整片就记上，传到一半重置也算开了 */
  private opened = new Set<number>();
  /** 用掉的钥匙（地图上的第几把）→ 它开的那扇门：重置那扇门所在的房间时钥匙回到原位 */
  private used = new Map<number, LockCell>();
  /** 永远用掉了的钥匙（地图上的第几把）→ 它开的门在哪个房间（key）：那个房间解开了，重置也不回来 */
  private spent = new Map<number, string>();
  /** 连锁还没传到的那几格 */
  private pending: Phaser.Time.TimerEvent[] = [];
  private pendingCells = new Map<Phaser.Time.TimerEvent, LockCell[]>();
  /** 每扇门的锁孔：挂在这扇门最靠正中的那一格上（格子序号 → 图） */
  private keyholes = new Map<number, Phaser.GameObjects.Image>();

  constructor(private ctx: PlayContext, private data: LockData) {}

  private get carry(): Carry | undefined { return this.ctx.mech<Carry>('carry'); }
  private color(group: number): number { return lockGroup(this.ctx.model, group)?.color ?? 0xffffff; }
  private isDoor(c: LockCell): boolean { return this.ctx.terrain.grid[c.y]?.[c.x] === DOOR_CHAR; }
  private index(c: LockCell): number { return c.y * this.ctx.terrain.w + c.x; }

  start(): void {
    const kept = new Set(this.spent.keys());
    const saved = this.ctx.carried('locks');
    if (saved && typeof saved === 'object' && 'floorId' in saved && saved.floorId === this.ctx.floor.id && 'keys' in saved && Array.isArray(saved.keys)) {
      for (const i of saved.keys) {
        if (!Number.isInteger(i) || kept.has(i)) continue;
        const c = this.data.keys[i];
        if (!c || !this.carry || this.carry.keys.length >= MAX_KEYS) continue;
        this.carry.restoreKey(keyCarryable(c.group, this.color(c.group), i));
        kept.add(i);
      }
    }
    this.spawnKeys(kept);
    this.placeKeyholes();
    this.tint();
  }

  /** 只在同层读档恢复随身钥匙；换层时忽略，地图原位也不会再生成一把。 */
  persist(): { floorId: string; keys: number[] } {
    return { floorId: this.ctx.floor.id, keys: (this.carry?.keys ?? []).flatMap(k => k.origin === undefined ? [] : [k.origin]) };
  }

  /** 每一把钥匙贴着同色的一扇门 → 从这扇门开始连锁打开，这把钥匙用掉 */
  updateAlive(): void {
    if (!this.data.doors.length) return;
    const T = this.ctx.cfg.tile, locked = (c: LockCell) => this.isDoor(c) && !this.opened.has(this.index(c));
    for (const key of this.carry?.keysInPlay() ?? []) {
      const door = touchedDoor(this.data.doors, key.group, key.area, T, TOUCH_PX, locked);
      if (!door || !this.open(door)) continue;
      key.use({ x: door.x * T + T / 2, y: door.y * T + T / 2 });   // 身后飘着的钥匙飞到碰到的那扇门上
      if (key.origin !== undefined) this.used.set(key.origin, door);
    }
  }

  /** 重置前：还没传到的连锁不用再等，重置之后一次拿掉 */
  onClear(): void { this.cancelPending(); }

  /**
   * 重置把门放回来了。整张地图：门就这样关着，钥匙回原位，手上拿着的、人丢下的不动；下一关：全部回原位；
   * 只重置房间：这个房间的门就这样关着（地形复原时放回来了），开它们用掉的钥匙放回原位
   */
  onReset(scope: 'room' | 'world' | 'level'): void {
    if (scope !== 'room') {
      this.opened.clear(); this.used.clear();
      const kept = this.carry?.clearKeys(scope === 'world') ?? new Set<number>();
      this.spent.forEach((_, i) => kept.add(i));
      this.spawnKeys(kept);
      this.tint();
      return;
    }
    const { rooms, cfg } = this.ctx, T = cfg.tile;
    const inRoom = (c: LockCell) => rooms.same(rooms.of(c.x * T + T / 2, c.y * T + T / 2), rooms.current);
    this.data.doors.forEach(c => { if (inRoom(c)) this.opened.delete(this.index(c)); });
    this.used.forEach((door, i) => {
      if (!inRoom(door)) return;
      this.used.delete(i);
      const c = this.data.keys[i];
      if (c) this.carry?.spawnGround(keyCarryable(c.group, this.color(c.group), i), c.x * T + T / 2, c.y * T + T / 2);
    });
    this.tint();
  }

  destroy(): void {
    this.cancelPending();
    this.keyholes.forEach(k => k.destroy());
    this.keyholes.clear();
  }

  // ---------- 解开 ----------
  /** 这个房间里这一组（颜色）的门开过吗 */
  openedIn(r: RoomCoord, group: number): boolean {
    return this.data.doors.some(c => c.group === group && this.inRoom(c, r) && this.opened.has(this.index(c)));
  }

  settling(): boolean { return this.pending.length > 0; }

  /** 房间解开：没传完的门直接开掉（不然记下来的地形里还留着门）；开这个房间里的门用掉的钥匙永远用掉 */
  onSolve(r: RoomCoord): void {
    const left = this.data.doors.filter(c => this.inRoom(c, r) && this.opened.has(this.index(c)) && this.isDoor(c));
    if (left.length) this.reveal(left);
    const key = this.ctx.rooms.key(r) ?? '';
    this.used.forEach((door, i) => { if (this.inRoom(door, r)) { this.used.delete(i); this.spent.set(i, key); } });
  }

  solvedState(r: RoomCoord): number[] | undefined {
    const key = this.ctx.rooms.key(r), keys = [...this.spent].filter(([, k]) => k === key).map(([i]) => i);
    return keys.length ? keys : undefined;
  }

  /** 读档：这些钥匙已经用掉了，不放到地上（门在存下来的地形里已经没了） */
  restoreSolved(r: RoomCoord, data: unknown): void {
    const key = this.ctx.rooms.key(r) ?? '';
    if (Array.isArray(data)) data.forEach(i => { if (Number.isInteger(i) && this.data.keys[i]) this.spent.set(i, key); });
  }

  private inRoom(c: LockCell, r: RoomCoord): boolean {
    const { rooms, cfg } = this.ctx, T = cfg.tile;
    return rooms.same(rooms.of(c.x * T + T / 2, c.y * T + T / 2), r);
  }

  /** 地图上的钥匙放到原位；kept = 还留着的那几把（手上的、人丢下的，第几把），它们不放 */
  private spawnKeys(kept?: Set<number>): void {
    const T = this.ctx.cfg.tile;
    this.data.keys.forEach((c, i) => {
      if (kept?.has(i)) return;
      this.carry?.spawnGround(keyCarryable(c.group, this.color(c.group), i), c.x * T + T / 2, c.y * T + T / 2);
    });
  }

  /** 门砖是白底，按组乘上颜色；锁孔跟着门在不在 */
  private tint(): void {
    this.data.doors.forEach(c => {
      if (!this.isDoor(c)) return;
      const t = this.ctx.terrain.layer.getTileAt(c.x, c.y);
      if (t) t.tint = this.color(c.group);
    });
    this.syncKeyholes();
  }

  /**
   * 每扇门（上下左右连在一起的同色门）放一个锁孔：放在离这扇门正中最近的那一格（U 形、L 形的门正中可能不是门）。
   * 一格宽的门就在那一格正中；宽的门在两格之间就放在格线上
   */
  private placeKeyholes(): void {
    if (!this.ctx.scene.textures.exists('keyhole')) return;
    const T = this.ctx.cfg.tile, seen = new Set<number>();
    for (const start of this.data.doors) {
      if (seen.has(this.index(start))) continue;
      const door = doorCluster(this.data.doors, start, () => true);
      door.forEach(c => seen.add(this.index(c)));
      const cx = door.reduce((s, c) => s + c.x, 0) / door.length, cy = door.reduce((s, c) => s + c.y, 0) / door.length;
      const at = door.reduce((best, c) => (Math.hypot(c.x - cx, c.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? c : best));
      // 正中落在格线上（偶数宽 / 高的门）而那边也是这扇门：锁孔放在格线上
      const has = (x: number, y: number) => door.some(c => c.x === x && c.y === y);
      const ox = Math.abs(cx - at.x - 0.5) < 0.01 && has(at.x + 1, at.y) ? 0.5 : 0;
      const oy = Math.abs(cy - at.y - 0.5) < 0.01 && has(at.x, at.y + 1) ? 0.5 : 0;
      const img = this.ctx.scene.add.image((at.x + 0.5 + ox) * T, (at.y + 0.5 + oy) * T, 'keyhole').setDepth(DEPTH.keyhole);
      this.keyholes.set(this.index(at), img);
    }
  }

  /** 锁孔挂的那一格还是锁着的门就显示，开了（或者门不在了）就收起来 */
  private syncKeyholes(): void {
    this.keyholes.forEach((img, i) => {
      const w = this.ctx.terrain.w, show = this.ctx.terrain.grid[Math.floor(i / w)]?.[i % w] === DOOR_CHAR && !this.opened.has(i);
      if (show === img.visible) return;
      this.ctx.scene.tweens.killTweensOf(img);
      if (show) { img.setVisible(true).setAlpha(1).setScale(1); return; }
      this.ctx.scene.tweens.add({ targets: img, scale: 1.4, alpha: 0, duration: 200, ease: 'Quad.out', onComplete: () => img.setVisible(false) });
    });
  }

  /** 碰到的门立刻开，相连的同色门按跳数一格格跟着开；开了返回 true（钥匙由调用方用掉） */
  private open(start: LockCell): boolean {
    const { ctx } = this;
    const cluster = doorCluster(this.data.doors, start, c => this.isDoor(c) && !this.opened.has(this.index(c)));
    if (!cluster.length) return false;
    cluster.forEach(c => this.opened.add(this.index(c)));
    this.syncKeyholes();
    ctx.scene.cameras.main.shake(120, 0.004);
    const byHop = new Map<number, DoorHop[]>();
    cluster.forEach(c => { const g = byHop.get(c.hop) ?? []; g.push(c); byHop.set(c.hop, g); });
    byHop.forEach((cells, hop) => {
      if (hop === 0) { this.vanish(cells); return; }
      this.scheduleVanish(cells, hop * ctx.cfg.lockChainDelayMs);
    });
    return true;
  }

  private scheduleVanish(cells: LockCell[], ms: number): void {
    const timer: Phaser.Time.TimerEvent = this.ctx.scene.time.delayedCall(ms, () => {
      this.pending = this.pending.filter(t => t !== timer); this.pendingCells.delete(timer); this.vanish(cells);
    });
    this.pending.push(timer); this.pendingCells.set(timer, cells);
  }

  checkpointState() {
    return { opened: [...this.opened], used: [...this.used], spent: [...this.spent],
      pending: [...this.pendingCells].map(([t, cells]) => ({ cells: cells.map(c => ({ ...c })), ms: t.getRemaining() })) };
  }

  restoreCheckpoint(data: unknown): void {
    const s = data as ReturnType<Locks['checkpointState']>;
    if (!s || !Array.isArray(s.opened) || !Array.isArray(s.used) || !Array.isArray(s.spent)) return;
    this.cancelPending(); this.opened = new Set(s.opened); this.used = new Map(s.used); this.spent = new Map(s.spent);
    s.pending.forEach(p => this.scheduleVanish(p.cells, p.ms));
    this.tint(); this.syncKeyholes();
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
    this.pending = []; this.pendingCells.clear();
  }
}
