import { describe, expect, it, vi } from 'vitest';
import type { PlayContext } from '@/game/core/PlayContext';
import type { RoomCoord } from '@/type';
import { SolveNodes } from '@/game/mechanics/solve';
import { Locks } from '@/game/mechanics/locks/Locks';
import type { Carryable } from '@/game/mechanics/carry/Carry';

const G = { rx: 0, ry: 2 };
const J = { rx: 1, ry: 0 };
function setup(floorId = 'f2', fired = false) {
  const saveCheckpoint = vi.fn(), solve = vi.fn();
  const ctx = {
    floor: { id: floorId }, rooms: {
      find: (key: string) => key === 'G' ? G : key === 'J' ? J : null,
      same: (a: RoomCoord, b: RoomCoord) => a.rx === b.rx && a.ry === b.ry,
    }, solves: { has: () => fired, solve }, saveCheckpoint,
    mech: () => undefined,
  } as unknown as PlayContext;
  const nodes = new SolveNodes(ctx);
  nodes.start();
  return { nodes, saveCheckpoint, solve };
}

describe.each([
  { name: 'G green', room: G, group: 2, id: 'f2.G.greenKey' },
  { name: 'J yellow', room: J, group: 3, id: 'f2.J.yellowKey' },
])('$name key checkpoint', ({ room, group, id }) => {
  it('saves on pickup once, never while holding or on a second pickup', () => {
    const { nodes, saveCheckpoint, solve } = setup();
    nodes.update();
    expect(saveCheckpoint).not.toHaveBeenCalled();
    nodes.onKeyPicked(group, room);
    expect(saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(solve).toHaveBeenCalledWith(room, id);
    for (let i = 0; i < 600; i++) nodes.update();
    nodes.onKeyPicked(group, room);
    expect(saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(solve).toHaveBeenCalledTimes(1);
  });
  it('ignores other rooms, colors and floors', () => {
    const { nodes, saveCheckpoint } = setup();
    nodes.onKeyPicked(1, room);
    nodes.onKeyPicked(group, { rx: 1, ry: 2 });
    expect(saveCheckpoint).not.toHaveBeenCalled();
    const other = setup('f1');
    other.nodes.onKeyPicked(group, room);
    expect(other.saveCheckpoint).not.toHaveBeenCalled();
  });
  it('does not repeat a node restored from the save', () => {
    const { nodes, saveCheckpoint } = setup('f2', true);
    nodes.onKeyPicked(group, room);
    expect(saveCheckpoint).not.toHaveBeenCalled();
  });
});

function loadKeys(saved: unknown, spent = false) {
  const keys: Carryable[] = [];
  const carry = { keys, restoreKey: (key: Carryable) => keys.push(key), spawnGround: vi.fn() };
  const ctx = {
    floor: { id: 'f2' }, cfg: { tile: 32 },
    model: { locks: { groups: [{ id: 2, color: 0x00ff00 }] } },
    carried: () => saved, mech: () => carry,
    rooms: { key: () => 'G' }, scene: { textures: { exists: () => false } },
  } as unknown as PlayContext;
  const locks = new Locks(ctx, { doors: [], keys: [{ x: 1, y: 2, group: 2 }] });
  if (spent) locks.restoreSolved(G, [0]);
  locks.start();
  return { keys, carry, locks };
}

describe('checkpoint key restoration', () => {
  it('restores the held green key without a duplicate on the ground', () => {
    const { keys, carry, locks } = loadKeys({ floorId: 'f2', keys: [0, 0, -1, 99, '0'] });
    expect(keys.map(k => [k.key, k.origin])).toEqual([[2, 0]]);
    expect(carry.spawnGround).not.toHaveBeenCalled();
    expect(locks.persist()).toEqual({ floorId: 'f2', keys: [0] });
  });
  it('does not bring keys to another floor or resurrect a spent key', () => {
    const other = loadKeys({ floorId: 'f1', keys: [0] });
    expect(other.keys).toEqual([]);
    expect(other.carry.spawnGround).toHaveBeenCalledTimes(1);
    const spent = loadKeys({ floorId: 'f2', keys: [0] }, true);
    expect(spent.keys).toEqual([]);
    expect(spent.carry.spawnGround).not.toHaveBeenCalled();
  });
  it('keeps old saves without keys compatible', () => {
    const old = loadKeys(undefined);
    expect(old.keys).toEqual([]);
    expect(old.carry.spawnGround).toHaveBeenCalledTimes(1);
  });
});
