import { describe, expect, it } from 'vitest';
import type { WorldModel } from '@/type';
import '@/game/registry/tiles';
import { addRoomAt, clearChar, deleteRoom, entityRows, findStart, moveRoom, normalizeModel, positionOf, roomKeyAt, setEntityCell, worldRows } from './WorldModel';

const small = (): WorldModel => ({
  roomW: 3, roomH: 2,
  layout: [['A', 'B'], ['C', 'D']],
  rooms: { A: ['RRR', 'R.R'], B: ['RRR', 'R.R'], C: ['R.R', 'RRR'], D: ['R.R', 'RRR'] },
  entities: { B: ['...', '.P.'] },
});

describe('WorldModel', () => {
  it('把房间拼成整张地图；物件在自己那层', () => {
    expect(worldRows(small())).toEqual(['RRRRRR', 'R.RR.R', 'R.RR.R', 'RRRRRR']);
    expect(entityRows(small())[1]).toBe('....P.');
  });

  it('旧格式：砖块行里的物件字符会搬到物件层，底下变空气', () => {
    const m: WorldModel = { roomW: 3, roomH: 1, layout: [['A']], rooms: { A: ['XMX'] } };
    normalizeModel(m);
    expect(m.rooms.A).toEqual(['X.X']);
    expect(m.entities?.A).toEqual(['.M.']);
  });

  it('找出生点，优先指定房间', () => {
    const m = small();
    expect(findStart(m)).toMatchObject({ x: 4, y: 1 });
    setEntityCell(m, 'C', 1, 0, 'P');
    expect(findStart(m, { rx: 0, ry: 1 })).toMatchObject({ x: 1, y: 2, pref: true });
  });

  it('清掉唯一物件', () => {
    const m = small();
    clearChar(m, 'P');
    expect(findStart(m)).toBeNull();
  });

  it('在越界位置加房间会向那个方向扩展布局', () => {
    const m = small();
    const k = addRoomAt(m, -1, 0);          // 左边加一列
    expect(m.layout[0].length).toBe(3);
    expect(positionOf(m, k)).toEqual({ rx: 0, ry: 0 });
    expect(positionOf(m, 'A')).toEqual({ rx: 1, ry: 0 });
    expect(m.layout[1][0]).toBeNull();       // 新列的另一格是空位
    expect(worldRows(m)[2].slice(0, 3)).toBe('RRR');   // 空位在地图里是实心岩石
  });

  it('拖拽交换、挪到空位、删除后自动裁掉空排', () => {
    const m = small();
    moveRoom(m, { rx: 0, ry: 0 }, { rx: 1, ry: 1 });   // A 和 D 交换
    expect(roomKeyAt(m, 1, 1)).toBe('A');
    expect(roomKeyAt(m, 0, 0)).toBe('D');
    moveRoom(m, { rx: 0, ry: 0 }, { rx: 0, ry: 2 });   // D 挪到下方新的一排
    expect(m.layout.length).toBe(3);
    expect(roomKeyAt(m, 0, 2)).toBe('D');
    expect(roomKeyAt(m, 0, 0)).toBeNull();
    deleteRoom(m, 'D');
    expect(m.layout.length).toBe(2);
    expect(m.rooms.D).toBeUndefined();
  });
});
