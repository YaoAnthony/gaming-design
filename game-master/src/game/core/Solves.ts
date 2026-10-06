// ===== 解开：房间的复原点往前挪 =====
// 没解开的房间，死了 / R 回到一开始的样子。解开节点（mechanics/solve）一触发，这个房间就算解开了：
// 等这一刻引发的事做完（门一格格消失、王之炸药炸完、碎块落地、引线烧完），把房间现在的样子记成它的复原点——
// 地形、引线，以及各机制自己的状态（Mechanic.onSolve）。之后死了 / R 回到这里，不再回到一开始。
// 正式玩的时候同时写进存档（run.solved），读档时这些房间直接换成解开时的样子（restore）。
import type Phaser from 'phaser';
import type { RoomCoord, SolvedFloor, SolvedRoom } from '@/type';
import type { Mechanic } from '@/game/mechanics/define';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseNet } from '@/game/fuse/Fuse';
import type { Rooms } from './Rooms';

/** 等房间安静下来最多等多久（毫秒）：被怪物驮着的纸这类一直在动的东西不等 */
const SETTLE_MAX_MS = 4000;

export interface SolvesDeps {
  scene: Phaser.Scene;
  rooms: Rooms;
  terrain: Terrain;
  fuses: FuseNet;
  /** 机制和它们的 id */
  mechs: () => [string, Mechanic][];
  /** 记进存档（试玩不记）：room = 房间 key，node = 这次是哪个节点触发的 */
  save: (room: string, data: SolvedRoom, node?: string) => void;
}

export class Solves {
  /** 触发了、还在等房间安静下来的：房间 key → 房间、哪个节点、什么时候触发的 */
  private pending = new Map<string, { r: RoomCoord; node?: string; at: number }>();
  /** 触发过的节点 id */
  private fired = new Set<string>();

  constructor(private readonly d: SolvesDeps) {}

  /** 这个节点触发过吗 */
  has(node: string): boolean { return this.fired.has(node); }

  /** 节点触发：这个房间解开了，等它安静下来再记 */
  solve(r: RoomCoord, node?: string): void {
    const key = this.d.rooms.key(r);
    if (!key || (node && this.fired.has(node))) return;
    if (node) this.fired.add(node);
    this.pending.set(key, { r, node: node ?? this.pending.get(key)?.node, at: this.d.scene.time.now });
  }

  /** 每帧：等着的房间安静下来了（或者等太久了）就记下来 */
  update(now: number): void {
    this.pending.forEach((p, key) => {
      if (now - p.at < SETTLE_MAX_MS && this.busy(p.r)) return;
      this.pending.delete(key);
      this.commit(p.r, key, p.node);
    });
  }

  /** 重置之前：还在等的房间不等了，按现在的样子记（不然解开了的东西被这次重置冲掉） */
  flush(): void {
    const all = [...this.pending.entries()];
    this.pending.clear();
    all.forEach(([key, p]) => this.commit(p.r, key, p.node));
  }

  /** 读档：存档里解开过的房间换成那时候的样子（地形建好、机制建好之后，start 之前） */
  restore(saved: SolvedFloor | undefined): void {
    if (!saved) return;
    saved.nodes.forEach(n => this.fired.add(n));
    const { rooms } = this.d;
    Object.entries(saved.rooms).forEach(([key, s]) => {
      const r = rooms.find(key);
      if (!r || s.terrain.length !== rooms.h || s.terrain.some(row => row.length !== rooms.w)) return;   // 地图改过、对不上：不放
      const x0 = r.rx * rooms.w, y0 = r.ry * rooms.h;
      this.d.terrain.restoreRect(x0, y0, s.terrain);
      if (s.fuse.length === rooms.h) this.d.fuses.restoreRect(x0, y0, s.fuse);
      this.d.mechs().forEach(([id, m]) => { if (id in s.mechs) m.restoreSolved?.(r, s.mechs[id]); });
    });
  }

  private busy(r: RoomCoord): boolean {
    const { rooms } = this.d;
    return this.d.terrain.busyIn(r.rx * rooms.w, r.ry * rooms.h, rooms.w, rooms.h) || this.d.fuses.busy || this.d.mechs().some(([, m]) => m.settling?.());
  }

  private commit(r: RoomCoord, key: string, node?: string): void {
    const { rooms, terrain, fuses } = this.d, x0 = r.rx * rooms.w, y0 = r.ry * rooms.h;
    this.d.mechs().forEach(([, m]) => m.onSolve?.(r));   // 先让机制收尾（没传完的门直接开掉），地形才是最后的样子
    terrain.commitRect(x0, y0, rooms.w, rooms.h);
    fuses.commitRect(x0, y0, rooms.w, rooms.h);
    const mechs: Record<string, unknown> = {};
    this.d.mechs().forEach(([id, m]) => { const v = m.solvedState?.(r); if (v !== undefined) mechs[id] = v; });
    this.d.save(key, { terrain: terrain.rowsIn(x0, y0, rooms.w, rooms.h), fuse: fuses.rowsIn(x0, y0, rooms.w, rooms.h), mechs }, node);
  }
}
