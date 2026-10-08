import { describe, expect, it, vi } from 'vitest';
import type { PlayContext } from '@/game/core/PlayContext';
import type { RoomCoord } from '@/type';
import { SolveNodes } from '@/game/mechanics/solve';
import { PushBlocks } from '@/game/mechanics/pushBlock/PushBlocks';

const D = { rx: 2, ry: 1 };
function setup(floor = 'f2', restored = false, plateRoom = D) {
  let weight = false;
  const saveCheckpoint = vi.fn(), solve = vi.fn();
  const ctx = {
    floor: { id: floor }, cfg: { tile: 32, platePressedByRubble: false },
    rooms: {
      find: (key: string) => key === 'D' ? D : null,
      same: (a: RoomCoord, b: RoomCoord) => a.rx === b.rx && a.ry === b.ry,
      of: (x: number, y: number) => ({ rx: Math.floor(x / 960), ry: Math.floor(y / 640) }),
    },
    solves: { has: () => restored, solve }, saveCheckpoint,
    weighs: () => weight, terrain: { isSolid: () => false },
    fuses: { endsNear: () => [] }, sparks: { explode: vi.fn() },
    mech: (id: string) => id === 'solve' ? nodes : undefined,
  } as unknown as PlayContext;
  const nodes = new SolveNodes(ctx);
  nodes.start();
  const blocks = Object.create(PushBlocks.prototype) as PushBlocks;
  Object.assign(blocks, { ctx, list: [], plates: [{
    cells: [{ x: plateRoom.rx * 30 + 10, y: plateRoom.ry * 20 + 16 }],
    pressed: false, gone: false, sprite: { setTexture: vi.fn() }, up: 'up', down: 'down',
  }] });
  // 执行真实压板状态转换，输入用重物是否压住模拟；不依赖图形引擎。
  const update = () => Reflect.apply(Reflect.get(blocks, 'updatePlates'), blocks, []);
  return { nodes, saveCheckpoint, solve, update, weight: (on: boolean) => { weight = on; } };
}

describe('D 房压板检查点', () => {
  it('首次压下立即保存，持续压住和松开重压都不重复', () => {
    const p = setup();
    p.update();
    expect(p.saveCheckpoint).not.toHaveBeenCalled();
    p.weight(true); p.update();
    expect(p.solve).toHaveBeenCalledWith(D, 'f2.D.plate');
    expect(p.saveCheckpoint).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 120; i++) { p.update(); p.nodes.update(); }
    p.weight(false); p.update();
    p.weight(true); p.update();
    expect(p.saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(p.solve).toHaveBeenCalledTimes(1);
  });
  it('不触发别的房间或楼层', () => {
    for (const p of [setup('f2', false, { rx: 3, ry: 1 }), setup('f1')]) {
      p.weight(true); p.update();
      expect(p.saveCheckpoint).not.toHaveBeenCalled();
    }
  });
  it('读档恢复的已触发节点不再保存', () => {
    const p = setup('f2', true);
    p.weight(true); p.update();
    expect(p.saveCheckpoint).not.toHaveBeenCalled();
  });
});
