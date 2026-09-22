import { describe, expect, it } from 'vitest';
import type { WorldModel } from '@/type';
import { addCol, addRow, clearChar, findStart, roomKeyAt, setCell, worldRows } from './WorldModel';

const small = (): WorldModel => ({
  roomW: 3, roomH: 2,
  layout: [['A', 'B'], ['C', 'D']],
  rooms: { A: ['RRR', 'R.R'], B: ['RRR', 'RPR'], C: ['R.R', 'RRR'], D: ['R.R', 'RRR'] },
  names: { A: 'a', B: 'b', C: 'c', D: 'd' },
});

describe('WorldModel', () => {
  it('把房间拼成整张地图', () => {
    expect(worldRows(small())).toEqual(['RRRRRR', 'R.RRPR', 'R.RR.R', 'RRRRRR']);
  });

  it('找出生点，优先指定房间', () => {
    const m = small();
    expect(findStart(m)).toMatchObject({ x: 4, y: 1 });
    setCell(m, 'C', 1, 0, 'P');
    expect(findStart(m, { rx: 0, ry: 1 })).toMatchObject({ x: 1, y: 2, pref: true });
  });

  it('清掉唯一物件', () => {
    const m = small();
    clearChar(m, 'P');
    expect(findStart(m)).toBeNull();
  });

  it('加排加列会创建新房间', () => {
    const m = small();
    addRow(m); addCol(m);
    expect(m.layout.length).toBe(3);
    expect(m.layout[0].length).toBe(3);
    expect(roomKeyAt(m, 2, 2)).toBeTruthy();
    expect(Object.keys(m.rooms).length).toBe(9);
    expect(worldRows(m).length).toBe(6);
  });
});
