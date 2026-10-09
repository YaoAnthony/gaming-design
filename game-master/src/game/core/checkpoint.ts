import { checkpointMapKey, type WorldCheckpoint, type Floor, type EntryState, type CarryOver, type RunStats, type FogState } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseNet } from '@/game/fuse/Fuse';
import type { Mechanic } from '@/game/mechanics/define';
import type { Enemies } from './Enemies';
import type { Debris } from './Debris';
import type { Rooms } from './Rooms';
import type { Solves } from './Solves';

export interface CheckpointSource {
  floor: Floor; tile: number; entry: EntryState; stage: number;
  carry: CarryOver; stats: RunStats; flags: Record<string, true>; fog: FogState | null;
  terrain: Terrain; fuses: FuseNet; enemies: Enemies; debris: Debris; rooms: Rooms; solves: Solves;
  mechs: [string, Mechanic][];
}

/** 一次性捕获全图；JSON 拷贝切断运行时数组/对象引用，后续动作不能改写检查点。 */
export function captureCheckpoint(d: CheckpointSource): WorldCheckpoint {
  const mechs: Record<string, unknown> = {};
  d.mechs.forEach(([id, m]) => { const s = m.checkpointState?.(); if (s !== undefined) mechs[id] = s; });
  const world: WorldCheckpoint = {
    version: 1, floorId: d.floor.id, mapKey: checkpointMapKey(d.floor.model), tile: d.tile,
    entry: d.entry, stage: d.stage, carry: d.carry, stats: d.stats, flags: d.flags,
    terrain: d.terrain.checkpointState(), fuse: d.fuses.checkpointState(), mechs,
    enemies: d.enemies.checkpointState(), paper: d.debris.checkpointState(),
    awake: d.rooms.checkpointState(), nodes: d.solves.checkpointNodes(), fog: d.fog,
  };
  return JSON.parse(JSON.stringify(world)) as WorldCheckpoint;
}

export function checkpointMatches(world: WorldCheckpoint, floor: Floor, tile: number, w: number, h: number): boolean {
  return world.floorId === floor.id && world.tile === tile && world.mapKey === checkpointMapKey(floor.model)
    && world.terrain.rows.length === h && world.terrain.rows.every(r => r.length === w)
    && world.fuse.rows.length === h && world.fuse.rows.every(r => r.length === w);
}
