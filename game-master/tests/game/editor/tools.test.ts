// 编辑器工具：每支画笔归谁管、画一格派发什么（和重构前 EditorScene 里写死的那几段行为一样）
import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { EditorTools, paletteTools, toolOf } from '@/game/editor/allTools';
import { isStatus, type CellCtx, type PaintResult } from '@/game/editor/tools';
import reducer, { replaceProject, type EditorState } from '@/redux/slices/editorSlice';
import { layerCell } from '@/game/world/layers';
import { fuseHas } from '@/game/fuse/channels';
import type { Project, WorldModel } from '@/type';

const project = (): Project => ({ floors: [{ id: 'f1', name: '一', model: { roomW: 4, roomH: 3, layout: [['A']], rooms: { A: ['RRRR', 'R..R', 'RSRR'] } } }] });
const fresh = (): EditorState => reducer(reducer(undefined, { type: '@@init' }), replaceProject(project()));
const model = (s: EditorState): WorldModel => s.project.floors[0].model;

/** 用画笔 brush 点 (x, y)：问工具要动作，有就交给 reducer */
function click(s: EditorState, brush: string, x: number, y: number, erase = false): { s: EditorState; r: PaintResult } {
  const tool = toolOf(brush)!;
  const ctx: CellCtx = { model: model(s), state: s, key: 'A', x, y, brush, erase };
  const r = tool.paint!(ctx);
  return { s: r && !isStatus(r) ? reducer(s, r) : s, r };
}

describe('编辑器工具的登记', () => {
  it('物品栏里每支画笔都归给出它的那个工具管，画笔不重复', () => {
    const s = reducer(fresh(), { type: 'editor/addLock' });
    const seen = new Set<string>();
    for (const tool of paletteTools()) {
      for (const b of tool.palette!.buttons(model(s), s)) {
        expect(toolOf(b.brush), b.brush).toBe(tool);
        expect(seen.has(b.brush), b.brush).toBe(false);
        seen.add(b.brush);
      }
    }
  });

  it('砖块、物件画笔不归任何工具（编辑器自己画）', () => {
    expect(toolOf('R')).toBeUndefined();
    expect(toolOf('P')).toBeUndefined();
  });

  it('物品栏按 order 排：引线、移动方块、文字、钥匙与门、迷雾区', () => {
    expect(paletteTools().map(t => t.id)).toEqual(['fuse', 'mover', 'textBlock', 'locks', 'fog']);
    expect(EditorTools.list().length).toBe(5);
  });
});

describe('画一格', () => {
  it('引线：左键画这种颜色，已经有了不再派发；右键只擦这种颜色', () => {
    let { s } = click(fresh(), 'fuse:0', 1, 1);
    s = click(s, 'fuse:2', 1, 1).s;
    expect(fuseHas(layerCell(model(s), 'fuse', 'A', 1, 1), 0)).toBe(true);
    expect(click(s, 'fuse:0', 1, 1).r).toBeNull();
    s = click(s, 'fuse:0', 1, 1, true).s;
    expect(fuseHas(layerCell(model(s), 'fuse', 'A', 1, 1), 0)).toBe(false);
    expect(fuseHas(layerCell(model(s), 'fuse', 'A', 1, 1), 2)).toBe(true);
  });

  it('移动方块：只能画在能动的砖上（沙土不行，提示原因）；右键擦', () => {
    const bad = click(fresh(), 'mover:h', 1, 2);
    expect(isStatus(bad.r)).toBe(true);
    let { s } = click(fresh(), 'mover:h', 0, 0);
    expect(model(s).movers!.A[0]).toBe('h...');
    s = click(s, 'mover:h', 0, 0, true).s;
    expect(model(s).movers!.A[0]).toBe('....');
  });

  it('钥匙与门：画存在的组；同样的不再派发；右键擦', () => {
    let s = fresh();
    s = reducer(s, { type: 'editor/addLock' });
    s = click(s, 'door:1', 0, 1).s;
    s = click(s, 'key:1', 1, 1).s;
    expect(model(s).locks!.doors.A[1]).toBe('1...');
    expect(model(s).locks!.keys.A[1]).toBe('.1..');
    expect(click(s, 'door:1', 0, 1).r).toBeNull();
    s = click(s, 'door:1', 0, 1, true).s;
    expect(model(s).locks!.doors.A[1]).toBe('....');
  });

  it('文字：点一下放一串，右键点到那串删掉', () => {
    let { s } = click(fresh(), 'text', 1, 0);
    expect(model(s).texts!.A).toHaveLength(1);
    expect(click(s, 'text', 0, 0, true).r).toBeNull();      // 字在它右边：没点到
    s = click(s, 'text', 1, 0, true).s;
    expect(model(s).texts!.A).toHaveLength(0);
  });

  it('迷雾区：拖出的矩形一次填上；右键整片擦掉', () => {
    const fog = toolOf('fog:2')!;
    const s0 = fresh();
    let s = reducer(s0, fog.paintRect!({ model: model(s0), state: s0, key: 'A', brush: 'fog:2', erase: false, x0: 2, y0: 0, x1: 1, y1: 1 })!);
    expect(model(s).fog!.A).toEqual(['.22.', '.22.', '....']);
    s = reducer(s, fog.paintRect!({ model: model(s), state: s, key: 'A', brush: 'fog:2', erase: true, x0: 1, y0: 1, x1: 1, y1: 1 })!);
    expect(model(s).fog!.A).toEqual(['.22.', '..2.', '....']);
  });
});
