import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import type { Project } from '@/type';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import reducer, { addLock, deleteFloor, removeLock, setBrush, addFloor, beginStroke, clearRoom, paintCell, redo, renameFloor, replaceProject, setFloor, undo, updateText, addText, type EditorState } from './editorSlice';

const project = (): Project => ({ floors: [{ id: 'f1', name: '一', model: { roomW: 3, roomH: 3, layout: [['A']], rooms: { A: ['RRR', 'R.R', 'RRR'] } } }] });
const fresh = (): EditorState => reducer(reducer(undefined, { type: '@@init' }), replaceProject(project()));
const row = (s: EditorState, y: number) => s.project.floors[s.floor].model.rooms.A[y];
const run = (s: EditorState, ...actions: Parameters<typeof reducer>[1][]) => actions.reduce(reducer, s);

describe('编辑器撤销 / 重做', () => {
  it('一笔画（按下到松开）算一步', () => {
    let s = run(fresh(), beginStroke(), paintCell({ key: 'A', x: 1, y: 1, ch: 'r' }), paintCell({ key: 'A', x: 1, y: 0, ch: '.' }));
    s = run(s, beginStroke(), paintCell({ key: 'A', x: 0, y: 1, ch: '.' }));
    expect(row(s, 1)).toBe('.rR');
    s = reducer(s, undo());
    expect([row(s, 0), row(s, 1)]).toEqual(['R.R', 'RrR']);
    s = reducer(s, undo());
    expect([row(s, 0), row(s, 1)]).toEqual(['RRR', 'R.R']);
    s = reducer(s, redo());
    expect(row(s, 1)).toBe('RrR');
  });

  it('新的改动清掉重做栈；撤销到底再撤销什么都不做', () => {
    let s = run(fresh(), beginStroke(), paintCell({ key: 'A', x: 1, y: 1, ch: 'r' }), undo(), beginStroke(), paintCell({ key: 'A', x: 1, y: 1, ch: 'B' }));
    expect(s.future).toEqual([]);
    s = reducer(s, undo());
    expect(row(s, 1)).toBe('R.R');
    s = reducer(s, undo());                             // 载入 / 导入项目也能撤销：回到载入前的默认地图（src/map/world.json，内容随你画的地图变）
    expect(s.project).toEqual(DEFAULT_PROJECT);
    const bottom = reducer(s, undo());                  // 撤到底：什么都不变
    expect(bottom.project).toBe(s.project);
  });

  it('撤销回到改动发生的那一层', () => {
    let s = run(fresh(), addFloor({ name: '二', roomW: 3, roomH: 3 }));
    expect(s.project.floors.length).toBe(2);
    s = run(s, setFloor(0), beginStroke(), paintCell({ key: 'A', x: 1, y: 1, ch: 'r' }), setFloor(1));
    s = reducer(s, undo());
    expect(s.floor).toBe(0);
    expect(row(s, 1)).toBe('R.R');
  });

  it('连续打字算一步；改房间尺寸、清空房间都能撤销', () => {
    let s = run(fresh(), addText({ key: 'A', block: { id: 't', x: 0, y: 0, text: '', tile: '=', target: 'f1' } }));
    s = run(s, updateText({ key: 'A', id: 't', patch: { text: 'H' } }), updateText({ key: 'A', id: 't', patch: { text: 'HI' } }));
    s = reducer(s, undo());
    expect(s.project.floors[0].model.texts!.A[0].text).toBe('');
    s = run(s, renameFloor({ index: 0, name: '一', roomW: 12.4, roomH: 10 }));   // 小数四舍五入
    expect(s.project.floors[0].model.roomW).toBe(12);
    expect(row(s, 1)).toBe('R.R' + '.'.repeat(9));
    s = run(s, clearRoom('A'));
    expect(s.project.floors[0].model.texts!.A).toBeUndefined();
    s = run(s, undo(), undo());
    expect([s.project.floors[0].model.roomW, row(s, 1)]).toEqual([3, 'R.R']);
  });
});

describe('编辑器的其它规则', () => {
  it('房间尺寸：超出范围夹回来，小数取整', () => {
    const s = run(fresh(), addFloor({ name: '大', roomW: 999, roomH: 3.6 }));
    expect([s.project.floors[1].model.roomW, s.project.floors[1].model.roomH]).toEqual([80, 10]);
    expect(s.project.floors[1].model.rooms.A.every(r => r.length === 80)).toBe(true);
  });

  it('删掉画笔所在的锁组：画笔换回默认，之后也画不出这一组', () => {
    let s = run(fresh(), addLock(), setBrush('door:1'), removeLock(1));
    expect(s.brush).toBe('R');
    s = run(s, paintCell({ key: 'A', x: 1, y: 1, ch: 'r' }));
    expect(s.project.floors[0].model.locks!.doors.A).toBeUndefined();
  });

  it('删掉当前层前面的层：还看着同一层', () => {
    let s = run(fresh(), addFloor({ name: '二', roomW: 10, roomH: 10 }), addFloor({ name: '三', roomW: 10, roomH: 10 }), setFloor(1));
    s = reducer(s, deleteFloor(0));
    expect(s.project.floors[s.floor].name).toBe('二');
  });
});
