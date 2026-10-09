import { describe, expect, it, vi } from 'vitest';
import type { PlayContext } from '@/game/core/PlayContext';
import type { RoomCoord } from '@/type';
import { SolveNodes } from '@/game/mechanics/solve';
import { Locks } from '@/game/mechanics/locks/Locks';

const Q = { rx: 1, ry: 1 };
function setup(floor = 'f2', restored = false) {
  const solve = vi.fn(), saveCheckpoint = vi.fn();
  const ctx = {
    floor: { id: floor }, cfg: { tile: 32 }, terrain: { w: 90 },
    rooms: {
      find: (key: string) => key === 'Q' ? Q : null,
      same: (a: RoomCoord, b: RoomCoord) => a.rx === b.rx && a.ry === b.ry,
      of: (x: number, y: number) => ({ rx: Math.floor(x / 960), ry: Math.floor(y / 640) }),
    },
    solves: { has: () => restored, solve }, saveCheckpoint,
    mech: (id: string) => id === 'locks' ? locks : undefined,
  } as unknown as PlayContext;
  const doors = [
    { x: 30, y: 27, group: 3 }, // Q yellow
    { x: 31, y: 27, group: 1 }, // Q blue
    { x: 60, y: 27, group: 3 }, // another room yellow
  ];
  const locks = new Locks(ctx, { doors, keys: [] });
  const nodes = new SolveNodes(ctx);
  nodes.start();
  const open = (i: number) => {
    const c = doors[i];
    (Reflect.get(locks, 'opened') as Set<number>).add(c.y * 90 + c.x);
  };
  return { nodes, solve, saveCheckpoint, open };
}

describe('Q yellow door checkpoint', () => {
  it('records the room once when the yellow door opens', () => {
    const p = setup();
    p.nodes.update();
    expect(p.solve).not.toHaveBeenCalled();
    p.open(0); p.nodes.update();
    expect(p.solve).toHaveBeenCalledWith(Q, 'f2.Q.yellow');
    for (let i = 0; i < 120; i++) p.nodes.update();
    expect(p.solve).toHaveBeenCalledTimes(1);
    expect(p.saveCheckpoint).toHaveBeenCalledTimes(1);
  });
  it('ignores other colors, rooms and floors', () => {
    const p = setup();
    p.open(1); p.open(2); p.nodes.update();
    expect(p.solve).not.toHaveBeenCalled();
    const other = setup('f1');
    other.open(0); other.nodes.update();
    expect(other.solve).not.toHaveBeenCalled();
  });
  it('does not repeat a node restored from the save', () => {
    const p = setup('f2', true);
    p.open(0); p.nodes.update();
    expect(p.solve).not.toHaveBeenCalled();
  });
});
