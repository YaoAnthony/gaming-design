// 按房间存的格子图层（引线、迷雾区、移动标记、门、钥匙……）：画格、删房间、清空房间、改尺寸时每一层都要一起动。
// 先按重构前的行为写好，重构之后这些结果不能变（只改最上面 ops 里怎么调用）
import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import type { WorldModel } from '@/type';
import { clearRoom, deleteRoom, resizeRooms, setRoomBackground, setRoomFlags } from '@/game/world/WorldModel';
import { addLockGroup, setDoorCell, setKeyCell } from '@/game/mechanics/locks/model';
import { setFuseCell } from '@/game/fuse/layer';
import { addTextBlock } from '@/game/mechanics/textBlock/model';
import { setLayerCell } from '@/game/world/layers';

/** 被测的操作（重构后只改这里） */
const ops = {
  fuse: (m: WorldModel, key: string, x: number, y: number, ch: number, on: boolean) => setFuseCell(m, key, x, y, ch, on),
  mover: (m: WorldModel, key: string, x: number, y: number, ch: string) => setLayerCell(m, 'movers', key, x, y, ch),
  door: (m: WorldModel, key: string, x: number, y: number, id: number) => setDoorCell(m, key, x, y, id),
  key: (m: WorldModel, key: string, x: number, y: number, id: number) => setKeyCell(m, key, x, y, id),
  fog: (m: WorldModel, key: string, x: number, y: number, zone: string) => setLayerCell(m, 'fog', key, x, y, zone),
  addLock: (m: WorldModel) => addLockGroup(m),
};

const model = (): WorldModel => ({ roomW: 4, roomH: 3, layout: [['A', 'B']], rooms: { A: ['RRRR', 'R..R', 'RRRR'], B: ['RRRR', 'R..R', 'RRRR'] } });

describe('格子图层：画一格', () => {
  it('引线：同一格能叠几种颜色，擦一种不动别的', () => {
    const m = model();
    ops.fuse(m, 'A', 1, 1, 0, true);
    ops.fuse(m, 'A', 1, 1, 2, true);
    const both = m.fuse!.A[1][1];
    ops.fuse(m, 'A', 1, 1, 0, false);
    expect(m.fuse!.A[1][1]).not.toBe(both);
    ops.fuse(m, 'A', 1, 1, 2, false);
    expect(m.fuse!.A).toEqual(['....', '....', '....']);
    expect(m.fuse!.B).toBeUndefined();
  });

  it('移动标记：画、擦', () => {
    const m = model();
    ops.mover(m, 'B', 2, 0, 'h');
    expect(m.movers!.B).toEqual(['..h.', '....', '....']);
    ops.mover(m, 'B', 2, 0, '.');
    expect(m.movers!.B).toEqual(['....', '....', '....']);
  });

  it('门、钥匙：只认存在的组；0 = 擦掉', () => {
    const m = model();
    ops.addLock(m);
    ops.door(m, 'A', 0, 1, 1);
    ops.key(m, 'A', 2, 1, 1);
    ops.door(m, 'A', 3, 1, 5);   // 第 5 组不存在：不写
    expect(m.locks!.doors.A).toEqual(['....', '1...', '....']);
    expect(m.locks!.keys.A).toEqual(['....', '..1.', '....']);
    ops.door(m, 'A', 0, 1, 0);
    expect(m.locks!.doors.A).toEqual(['....', '....', '....']);
  });

  it('迷雾区：画、擦', () => {
    const m = model();
    ops.fog(m, 'A', 1, 1, '2');
    expect(m.fog!.A).toEqual(['....', '.2..', '....']);
    ops.fog(m, 'A', 1, 1, '.');
    expect(m.fog!.A).toEqual(['....', '....', '....']);
  });
});

/** 每一层都画上一点的地图 */
function full(): WorldModel {
  const m = model();
  ops.addLock(m);
  ops.fuse(m, 'A', 0, 0, 0, true); ops.mover(m, 'A', 0, 0, 'h'); ops.door(m, 'A', 1, 1, 1); ops.key(m, 'A', 2, 1, 1); ops.fog(m, 'A', 1, 1, '1');
  m.entities = { A: ['....', '.P..', '....'] };
  setRoomFlags(m, 'A', { fog: true });
  setRoomBackground(m, 'A', 'cave');
  addTextBlock(m, 'A', { id: 't', x: 0, y: 0, text: 'A', tile: '=', target: 'f2' });
  return m;
}

describe('删房间 / 清空房间 / 改尺寸：每一层一起动', () => {
  it('删房间：这个房间在每一层的数据都删掉，别的房间不动', () => {
    const m = full();
    ops.mover(m, 'B', 1, 1, 'v');
    deleteRoom(m, 'A');
    expect(m.rooms.A).toBeUndefined();
    for (const layer of [m.fuse, m.movers, m.fog, m.entities, m.roomFlags, m.roomBackgrounds, m.texts, m.locks!.doors, m.locks!.keys]) expect(layer?.A).toBeUndefined();
    expect(m.movers!.B).toEqual(['....', '.v..', '....']);
  });

  it('清空房间：砖块回到空房间，各层、开关、文字删掉；背景留着', () => {
    const m = full();
    clearRoom(m, 'A');
    expect(m.rooms.A).toBeDefined();
    for (const layer of [m.fuse, m.movers, m.fog, m.entities, m.roomFlags, m.texts, m.locks!.doors, m.locks!.keys]) expect(layer?.A).toBeUndefined();
    expect(m.roomBackgrounds?.A).toBe('cave');
  });

  it('改尺寸：每一层的每个房间都跟着裁 / 补', () => {
    const m = full();
    resizeRooms(m, 5, 4);
    for (const layer of [m.rooms, m.fuse, m.movers, m.fog, m.entities, m.locks!.doors, m.locks!.keys]) {
      for (const rows of Object.values(layer!)) { expect(rows.length).toBe(4); rows.forEach(r => expect(r.length).toBe(5)); }
    }
    expect(m.movers!.A[0]).toBe('h....');
  });
});
