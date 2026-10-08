// 每张图都能有自己的背景：每层一个默认、房间可以单独换；认不出的 id 退回星空；图放多大、视差挪多少
import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { BACKGROUNDS, DEFAULT_BACKGROUND, backgroundDef, backgroundUrl } from '@/asset/backgrounds';
import { backgroundOf, backgroundsOfFloor, coverScale, parallaxOffset, startRoomKey } from '@/game/background/layout';
import { deleteRoom, setRoomBackground } from '@/game/world/WorldModel';
import reducer, { addFloor, renameFloor, replaceProject, setRoomBackground as setRoomBg, undo, type EditorState } from '@/redux/slices/editorSlice';
import type { Floor, Project } from '@/type';

const floor = (over: Partial<Floor> = {}): Floor => ({
  id: 'f', name: 'F', model: { roomW: 3, roomH: 3, layout: [['A', 'B'], [null, 'C']], rooms: { A: ['...', '...', '...'], B: ['...', '...', '...'], C: ['...', '...', '...'] } }, ...over,
});

describe('背景清单', () => {
  it('每个背景的每层图都在 src/asset/image/background/ 里（打包时有地址）', () => {
    for (const b of BACKGROUNDS) for (const l of b.layers) expect(backgroundUrl(l.file), `${b.id}/${l.file}`).toBeTruthy();
  });

  it('id 不重复，默认的那个在里面', () => {
    const ids = BACKGROUNDS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_BACKGROUND);
    expect(backgroundDef('nope').id).toBe(DEFAULT_BACKGROUND);
  });
});

describe('每个房间用哪个背景', () => {
  it('房间单独设了用房间的，否则用这一层的，都没有用默认的', () => {
    const f = floor({ background: 'cave' });
    f.model.roomBackgrounds = { B: 'dusk' };
    expect(backgroundOf(f, f.model, 'A')).toBe('cave');
    expect(backgroundOf(f, f.model, 'B')).toBe('dusk');
    expect(backgroundOf(floor(), floor().model, 'A')).toBe(DEFAULT_BACKGROUND);
  });

  it('认不出来的 id（改了名、删了）退回默认，不让那一层起不来', () => {
    const f = floor({ background: 'gone' });
    expect(backgroundOf(f, f.model, 'A')).toBe(DEFAULT_BACKGROUND);
  });

  it('一层用到的背景去重列出来（只加载这些）', () => {
    const f = floor({ background: 'cave' });
    f.model.roomBackgrounds = { C: 'dusk' };
    expect(backgroundsOfFloor(f).sort()).toEqual(['cave', 'dusk']);
  });
});

describe('图放多大、视差挪多少', () => {
  it('放大到盖住房间加视差留的边（左右各留 parallax，上下各留一半）', () => {
    const s = coverScale(480, 288, 800, 480, { parallax: 20 });
    expect(480 * s).toBeGreaterThanOrEqual(840);
    expect(288 * s).toBeGreaterThanOrEqual(500);
  });

  it('人在房间正中不挪；走到边上挪满，方向相反；出了房间不再多挪', () => {
    expect(parallaxOffset(0.5, 0.5, { parallax: 20 })).toEqual({ dx: -0, dy: -0 });
    expect(parallaxOffset(1, 0.5, { parallax: 20 }).dx).toBe(-20);
    expect(parallaxOffset(0, 0, { parallax: 20 })).toEqual({ dx: 20, dy: 10 });
    expect(parallaxOffset(3, -2, { parallax: 20 })).toEqual({ dx: -20, dy: 10 });
  });
});

describe('地图和编辑器', () => {
  it('房间背景：设、清掉（清空后不留空对象）、删房间时一起删', () => {
    const m = floor().model;
    setRoomBackground(m, 'A', 'cave');
    expect(m.roomBackgrounds).toEqual({ A: 'cave' });
    setRoomBackground(m, 'A', null);
    expect(m.roomBackgrounds).toBeUndefined();
    setRoomBackground(m, 'B', 'dusk');
    deleteRoom(m, 'B');
    expect(m.roomBackgrounds).toEqual({});
  });

  it('编辑器：层背景（默认的不存）、房间背景，都能撤销', () => {
    const project: Project = { floors: [floor()] };
    let s: EditorState = reducer(reducer(undefined, { type: '@@init' }), replaceProject(project));
    s = reducer(s, renameFloor({ index: 0, name: 'F', background: 'cave' }));
    expect(s.project.floors[0].background).toBe('cave');
    s = reducer(s, renameFloor({ index: 0, name: 'F', background: DEFAULT_BACKGROUND }));
    expect(s.project.floors[0].background).toBeUndefined();
    s = reducer(s, setRoomBg({ key: 'A', id: 'dusk' }));
    expect(s.project.floors[0].model.roomBackgrounds).toEqual({ A: 'dusk' });
    s = reducer(s, undo());
    expect(s.project.floors[0].model.roomBackgrounds).toBeUndefined();
    s = reducer(s, addFloor({ name: 'G', roomW: 20, roomH: 12, background: 'dusk' }));
    expect(s.project.floors.at(-1)!.background).toBe('dusk');
  });
});

describe('开场在哪个房间（它的背景进这一层之前就下好）', () => {
  const m = { roomW: 3, roomH: 3, layout: [['A', 'B'], [null, 'C']], entities: { C: ['...', '.P.', '...'] } };
  it('给了进场位置就是那个房间，给了起始房间就是它', () => {
    expect(startRoomKey(m, 32, { entry: { x: 3 * 32 + 5, y: 5 } })).toBe('B');
    expect(startRoomKey(m, 32, { startRoom: { rx: 1, ry: 0 } })).toBe('B');
  });
  it('都没给：出生点 P 所在的房间；没有出生点就是第一个房间；指到空格子的不算', () => {
    expect(startRoomKey(m, 32, {})).toBe('C');
    expect(startRoomKey({ ...m, entities: {} }, 32, {})).toBe('A');
    expect(startRoomKey(m, 32, { startRoom: { rx: 0, ry: 1 } })).toBe('C');
    expect(startRoomKey({ roomW: 3, roomH: 3, layout: [[null]] }, 32, {})).toBeNull();
  });
});
