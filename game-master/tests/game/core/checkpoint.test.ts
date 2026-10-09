import { describe, expect, it, vi } from 'vitest';
import { GameScene } from '@/game/scenes/GameScene';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { Terrain } from '@/game/terrain/Terrain';
import { FuseNet } from '@/game/fuse/Fuse';
import { captureCheckpoint, checkpointMatches, type CheckpointSource } from '@/game/core/checkpoint';
import { readRun, readWorldCheckpoint, readSave, SAVE_FORMAT } from '@/redux/persist';
import runReducer, { checkpoint, EMPTY_RUN } from '@/redux/slices/runSlice';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { resumeData } from '@/game/world/resume';
import { Carry } from '@/game/mechanics/carry/Carry';
import { defineTile, Traits } from '@/game/registry/registry';
import { checkpointScene } from '../../support/checkpointScene';

defineTile({ id: 'y', name: 'checkpoint chain fixture', color: 0xffffff, frame: 0 }, Traits.Solid, Traits.Anchor, Traits.Destructible(0), Traits.Chain, Traits.Delay(100));
const rows = ['RRRRRRRRRR', 'R........R', 'RrrrrrrrrR', 'RRRRRRRRRR'];
function mapState() {
  const f = checkpointScene();
  const terrain = new Terrain(f.host, rows, { tile: 32, explosionRadius: 1.5, chunkGravity: 1400, chunkMaxFall: 700 });
  const fuses = new FuseNet(f.host.scene, ['..........', '..........', '.WWWWWWWW.', '..........'], { tile: 32, delayMs: 90 });
  return { ...f, terrain, fuses };
}
function setup() {
  const m = mapState(), base = DEFAULT_PROJECT.floors[0];
  const floor = { ...base, id: 'f2', model: { ...base.model, roomW: 5, roomH: 4, layout: [['G', 'J']] } };
  const key = { id: 'key:3', key: 3, origin: 0, texture: 'key', tint: 0xffdd00, light: 0 };
  const carry = Object.create(Carry.prototype) as Carry;
  const ground = [{ carry: { ...key, key: 2, id: 'key:2', origin: 1 }, blocked: false, dropped: true, loose: { x: 70, y: 80, vx: 0, vy: 0, home: { x: 48, y: 80 }, onGround: true } }];
  Object.assign(carry, { held: null, trail: [{ carry: key }], ground, ctx: { loose: { checkpointItem: (s: unknown) => s } } });
  const d = {
    floor, tile: 32, kind: 'checkpoint', entry: { x: 224, y: 64, vx: 0, vy: 0 }, stage: 0,
    carry: { locks: { floorId: 'f2', keys: [0] } }, stats: { jumps: 5, destroyed: 1 }, flags: {}, fog: null,
    terrain: m.terrain, fuses: m.fuses,
    enemies: { checkpointState: () => [] }, debris: { checkpointState: () => [] },
    rooms: { checkpointState: () => ['0,0', '1,0'] }, solves: { checkpointNodes: () => ['f2.J.yellowKey'] },
    mechs: [['carry', carry]],
  } as unknown as CheckpointSource;
  return { ...m, d, floor, ground, key };
}

describe('full-map checkpoint', () => {
  it('keeps destroyed terrain outside J and both held and loose key instances across JSON/Redux/resume', () => {
    const p = setup();
    p.terrain.set(2, 2, '.'); // G changed before obtaining the yellow key in J
    const world = captureCheckpoint(p.d);
    const run = runReducer(EMPTY_RUN, checkpoint({ floorId: 'f2', room: { rx: 1, ry: 0 }, world, carry: world.carry, stats: world.stats }));
    const loaded = readRun(JSON.parse(JSON.stringify(run)))!;
    const data = resumeData({ ...DEFAULT_PROJECT, floors: [p.floor] }, loaded);
    const rebuilt = mapState();
    rebuilt.terrain.restoreCheckpoint(data.world!.terrain);
    expect(rebuilt.terrain.get(2, 2)).toBe('.');
    expect(data.entry).toEqual(world.entry);
    expect(data.world!.mechs.carry).toMatchObject({ keys: [{ key: 3, origin: 0 }], ground: [{ carry: { key: 2, origin: 1 }, loose: { x: 70 } }] });
    expect(data.world!.nodes).toEqual(['f2.J.yellowKey']);
  });
  it('later mutations do not change the saved checkpoint', () => {
    const p = setup(), world = captureCheckpoint(p.d);
    p.terrain.set(2, 2, '.'); p.key.tint = 0; p.ground[0].loose.x = 999;
    expect(world.terrain.rows[2][2]).toBe('r');
    expect(world.mechs.carry).toMatchObject({ keys: [{ tint: 0xffdd00 }], ground: [{ loose: { x: 70 } }] });
  });
  it('restores mid-burn remaining time once, without reviving burned cells', () => {
    const p = setup();
    p.fuses.ignite(p.fuses.endsAt(1, 2), p.terrain); p.advance(120);
    const world = captureCheckpoint(p.d), rebuilt = mapState();
    rebuilt.terrain.restoreCheckpoint(world.terrain);
    rebuilt.fuses.restoreCheckpoint(world.fuse, rebuilt.terrain);
    expect(rebuilt.terrain.get(1, 2)).toBe('.'); expect(rebuilt.terrain.get(3, 2)).toBe('r');
    expect(rebuilt.fuses.ignite(rebuilt.fuses.endsAt(8, 2), rebuilt.terrain)).toBe(0);
    rebuilt.advance(59); expect(rebuilt.terrain.get(3, 2)).toBe('r');
    rebuilt.advance(1); expect(rebuilt.terrain.get(3, 2)).toBe('.');
    rebuilt.advance(1000); expect(rebuilt.fuses.busy).toBe(false);
    expect(rebuilt.terrain.grid[2].join('')).toBe('R........R');
  });
  it('preserves delayed terrain destruction and resumes it after reload', () => {
    const f = checkpointScene();
    const t = new Terrain(f.host, ['RRRRR', 'RyyyR', 'RRRRR'], { tile: 32, explosionRadius: 1, chunkGravity: 1400, chunkMaxFall: 700 });
    t.destroyCells(t.previewCells([{ x: 1, y: 1 }])); f.advance(40);
    const state = JSON.parse(JSON.stringify(t.checkpointState()));
    t.cancelPending(); t.restoreCheckpoint(state);
    f.advance(59); expect(t.get(2, 1)).toBe('y');
    f.advance(1); expect(t.get(2, 1)).toBe('.');
    f.advance(100); expect(t.get(3, 1)).toBe('.');
  });
  it('restores falling material without spawning a second copy or making it disappear', () => {
    const p = setup(); p.terrain.set(3, 2, '.'); p.terrain.set(3, 1, 'B'); p.terrain.shake([{ x: 3, y: 1 }], 0);
    const state = JSON.parse(JSON.stringify(p.terrain.checkpointState()));
    const before = state.chunks.reduce((n: number, c: { cells: unknown[] }) => n + c.cells.length, 0);
    expect(before).toBeGreaterThan(0);
    p.terrain.restoreCheckpoint(state);
    expect(p.terrain.chunks.reduce((n, c) => n + c.cells.length, 0)).toBe(before);
    expect(p.terrain.get(3, 1)).toBe('.');
  });
  it('rejects partial or incompatible snapshots as a whole', () => {
    const p = setup(), world = captureCheckpoint(p.d);
    expect(readWorldCheckpoint({ ...world, fuse: { rows: [] } })).toBeNull();
    expect(readWorldCheckpoint({ ...world, terrain: { ...world.terrain, chunks: [{}] } })).toBeNull();
    expect(readWorldCheckpoint({ ...world, mechs: { carry: { keys: [], ground: [{}] } } })).toBeNull();
    expect(readWorldCheckpoint({ ...world, terrain: { ...world.terrain, origin: [] } })).toBeNull();
    expect(checkpointMatches(world, p.floor, 32, 10, 4)).toBe(true);
    expect(checkpointMatches(world, { ...p.floor, model: { ...p.floor.model, layout: [['J', 'G']] } }, 32, 10, 4)).toBe(false);
    const save = { format: SAVE_FORMAT, mapHash: 'old', run: { ...EMPTY_RUN, active: true, world } };
    expect(readSave(save, 'new').run!.world).toBeNull();
  });
  it('distinguishes entrance autosaves and real checkpoints, including saves written before kind existed', () => {
    const world = captureCheckpoint(setup().d);
    const { kind: _kind, ...old } = world;
    expect(readWorldCheckpoint(old)?.kind).toBe('checkpoint');
    expect(readWorldCheckpoint({ ...old, nodes: [] })?.kind).toBe('entry');
    expect(readWorldCheckpoint({ ...world, kind: 'entry' })?.kind).toBe('entry');
    expect(readWorldCheckpoint({ ...world, kind: 'invalid' })).toBeNull();
  });
  it('migrates version 2 saves without inventing missing full-map state', () => {
    const legacy = readRun({ ...EMPTY_RUN, version: 2, active: true, carry: { locks: { floorId: 'f2', keys: [0] } }, world: undefined })!;
    expect(legacy.version).toBe(3); expect(legacy.world).toBeNull();
    expect(legacy.carry.locks).toEqual({ floorId: 'f2', keys: [0] });
  });
});


describe('room entrance versus explicit checkpoint', () => {
  function scenePolicy(kind: 'entry' | 'checkpoint') {
    const p = setup(), world = { ...captureCheckpoint(p.d), kind };
    const entry = { x: 48, y: 64, vx: 120, vy: 0 }, restart = vi.fn(), persist = vi.fn();
    const scene = Object.assign(new GameScene(), {
      worldCheckpoint: world, checkpointPending: null, respawn: { entry },
      floor: p.floor, cfg: { tile: 32 }, terrain: { w: 10, h: 4 }, scene: { restart },
      rooms: { of: () => ({ rx: 1, ry: 0 }) }, startData: {}, project: DEFAULT_PROJECT,
      persistWorldCheckpoint: persist,
    }) as unknown as {
      worldCheckpoint: typeof world; checkpointPending: { entry: typeof entry | null; kind: 'entry' | 'checkpoint' } | null;
      saveCheckpoint(explicit?: boolean): void; restoreWorldCheckpoint(): boolean;
    };
    return { scene, world, entry, restart, persist };
  }
  it('an initial snapshot does not override the current room entrance on death', () => {
    const p = scenePolicy('entry');
    expect(p.scene.restoreWorldCheckpoint()).toBe(false);
    expect(p.restart).not.toHaveBeenCalled(); expect(p.persist).not.toHaveBeenCalled();
  });
  it('updates entrance saves before a real checkpoint, including the entry velocity', () => {
    const p = scenePolicy('entry'); p.scene.saveCheckpoint();
    expect(p.scene.checkpointPending).toEqual({ entry: p.entry, kind: 'entry' });
  });
  it('an explicit checkpoint still restores the entire map and its saved position', () => {
    const p = scenePolicy('checkpoint');
    expect(p.scene.restoreWorldCheckpoint()).toBe(true);
    expect(p.persist).toHaveBeenCalledWith(p.world);
    expect(p.restart).toHaveBeenCalledWith(expect.objectContaining({ world: p.world, entry: p.world.entry }));
  });
  it('ordinary room changes cannot replace a saved or pending real checkpoint', () => {
    const saved = scenePolicy('checkpoint'); saved.scene.saveCheckpoint(); expect(saved.scene.checkpointPending).toBeNull();
    const pending = scenePolicy('entry'); pending.scene.saveCheckpoint(true);
    const before = pending.scene.checkpointPending; pending.scene.saveCheckpoint();
    expect(pending.scene.checkpointPending).toBe(before);
  });
});
