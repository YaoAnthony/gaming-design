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

  it('混合格式：砖块行里残留的物件字符照样能读到，地形里当空气', () => {
    const m: WorldModel = { roomW: 3, roomH: 1, layout: [['A']], rooms: { A: ['XGX'] }, entities: { A: ['...'] } };
    expect(entityRows(m)).toEqual(['.G.']);
    expect(worldRows(m)).toEqual(['X.X']);
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

// ---- 多层项目 + 文字方块 ----
import { asProject, bakeTexts, floorAfter, newFloor } from './WorldModel';
import { layoutText, textSize } from './font';

describe('font', () => {
  it('A 占 3x5，字间空一格，换行空一行', () => {
    expect(textSize('A')).toEqual({ w: 3, h: 5 });
    expect(textSize('AB')).toEqual({ w: 7, h: 5 });
    expect(textSize('A\nB')).toEqual({ w: 3, h: 11 });
    const cells = layoutText('I', 2, 3);
    expect(cells.length).toBe(9);                       // I：上下横杠各 3 格 + 中间一竖 3 格
    expect(cells.every(c => c.x >= 2 && c.x < 5 && c.y >= 3 && c.y < 8)).toBe(true);
  });
});

describe('project', () => {
  it('旧的单层地图包装成一层项目', () => {
    const p = asProject({ roomW: 4, roomH: 4, layout: [['A']], rooms: { A: ['RRRR', 'R..R', 'R..R', 'RRRR'] } })!;
    expect(p.floors.length).toBe(1);
    expect(p.floors[0].id).toBe('f1');
    expect(asProject({ nope: 1 })).toBeNull();
  });
  it('新层 id 不重复，floorAfter 顺着走', () => {
    const p = asProject({ roomW: 4, roomH: 4, layout: [['A']], rooms: { A: ['RRRR', 'R..R', 'R..R', 'RRRR'] } })!;
    p.floors.push(newFloor(p, '', 6, 5));
    expect(p.floors[1].id).toBe('f2');
    expect(p.floors[1].model.roomW).toBe(6);
    expect(floorAfter(p, 'f1')?.id).toBe('f2');
    expect(floorAfter(p, 'f2')).toBeNull();
  });
  it('文字只烘进空气格，并记下世界坐标', () => {
    const m = { roomW: 6, roomH: 7, layout: [['A']], rooms: { A: ['RRRRRR', 'R....R', 'R....R', 'R....R', 'R....R', 'R....R', 'RRRRRR'] }, texts: { A: [{ id: 't', x: 1, y: 1, text: 'I', tile: '=', target: 'f2' }] } };
    const { model, blocks } = bakeTexts(m);
    expect(blocks[0].cells.length).toBe(9);
    expect(model.rooms.A[1]).toBe('R===.R');
    expect(model.rooms.A[2]).toBe('R.=..R');
    expect(m.rooms.A[1]).toBe('R....R');              // 原模型不动
    expect(blocks[0].cells[0]).toEqual({ x: 1, y: 1 });
  });
});
