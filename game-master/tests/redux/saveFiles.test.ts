// 存档分成两份（save / editor）、地图更新后进度不丢、旧版一整块能迁移、写入有防抖且能马上写掉
import { describe, expect, it, vi } from 'vitest';
import { createWriter, EDITOR_FORMAT, loadPersisted, readEditor, readLegacy, readSave, SAVE_FORMAT } from '@/redux/persist';
import { EMPTY_RUN } from '@/redux/slices/runSlice';
import { browserStorage, type SaveName } from '@/platform/storage';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';

const RUN = { ...EMPTY_RUN, active: true, floorId: DEFAULT_PROJECT.floors[0].id, room: { rx: 0, ry: 0 }, stage: 1, stats: { jumps: 3, destroyed: 2 } };
const save = (over: object = {}) => ({ format: SAVE_FORMAT, savedAt: '2026-01-01T00:00:00Z', mapHash: 'h1', run: RUN, settings: { lang: 'zh', musicVolume: 0.5 }, ...over });
const editor = (over: object = {}) => ({ format: EDITOR_FORMAT, mapHash: 'h1', project: DEFAULT_PROJECT, floor: 0, room: { rx: 0, ry: 0 }, play: { stage: 2, hat: true, held: '' }, fileHash: 'abc', ...over });

/** 内存里的存储：两份各一个格子 */
function memory(init: Partial<Record<SaveName, string>> = {}) {
  const data = new Map<SaveName, string>(Object.entries(init) as [SaveName, string][]);
  return { data, read: (n: SaveName) => data.get(n) ?? null, write: (n: SaveName, t: string) => { data.set(n, t); } };
}

describe('存档（save 那一份）', () => {
  it('同一版地图：进度和设置原样读回来', () => {
    expect(readSave(save(), 'h1')).toEqual({ run: RUN, settings: { lang: 'zh' }, config: { musicVolume: 0.5 } });
  });

  it('地图更新过：进度保留，只是不回原来那个房间', () => {
    expect(readSave(save(), 'h2').run).toEqual({ ...RUN, room: null });
  });

  it('格式不认识、坏掉的：当作没有', () => {
    expect(readSave(save({ format: 99 }), 'h1')).toEqual({});
    expect(readSave(null, 'h1')).toEqual({});
    expect(readSave(save({ settings: { lang: 'fr', musicVolume: 7 } }), 'h1')).toEqual({ run: RUN, config: { musicVolume: 1 } });
  });
});

describe('编辑器的工作区（editor 那一份）', () => {
  it('读回项目、层、房间、试玩状态和文件指纹', () => {
    const e = readEditor(editor(), 'h1', false)!;
    expect(e.floor).toBe(0);
    expect(e.room).toEqual({ rx: 0, ry: 0 });
    expect(e.play).toEqual({ stage: 2, hat: true, held: '' });
    expect(e.fileHash).toBe('abc');
    expect(e.project?.floors.length).toBe(DEFAULT_PROJECT.floors.length);
  });

  it('线上版本：编辑副本和打包地图对不上就不要项目（试玩状态留着）', () => {
    const e = readEditor(editor(), 'h2', true)!;
    expect(e.project).toBeUndefined();
    expect(e.play).toEqual({ stage: 2, hat: true, held: '' });
  });

  it('房间在那一层不存在了：不要房间', () => {
    expect(readEditor(editor({ room: { rx: 99, ry: 99 } }), 'h1', false)!.room).toBeUndefined();
  });
});

describe('从存储里读回来', () => {
  it('两份分开读；线上版本不读编辑器的', () => {
    const m = memory({ save: JSON.stringify(save()), editor: JSON.stringify(editor()) });
    expect(loadPersisted(m, { mapHash: 'h1', withEditor: true, dropStale: false }).editor?.fileHash).toBe('abc');
    expect(loadPersisted(m, { mapHash: 'h1', withEditor: false, dropStale: true }).editor).toBeUndefined();
  });

  it('文件里不是 JSON：当作没有，不抛错', () => {
    expect(loadPersisted(memory({ save: '{oops' }), { mapHash: 'h1', withEditor: true, dropStale: false })).toEqual({});
  });

  it('只有旧版那一整块：拆成两份读出来', () => {
    const legacy = JSON.stringify({ editor: { project: DEFAULT_PROJECT, floor: 0, play: { stage: 1 } }, config: { musicVolume: 0.2 }, settings: { lang: 'zh' }, run: RUN, defaultHash: 'h1' });
    const out = loadPersisted(memory(), { mapHash: 'h1', withEditor: true, dropStale: false, legacy });
    expect(out.run).toEqual(RUN);
    expect(out.settings).toEqual({ lang: 'zh' });
    expect(out.config).toEqual({ musicVolume: 0.2 });
    expect(out.editor?.play).toEqual({ stage: 1 });
  });

  it('已经有新的两份：不再看旧版那一整块', () => {
    const legacy = JSON.stringify({ settings: { lang: 'en' } });
    expect(loadPersisted(memory({ save: JSON.stringify(save()) }), { mapHash: 'h1', withEditor: false, dropStale: true, legacy }).settings).toEqual({ lang: 'zh' });
  });

  it('旧版一整块，地图更新过：进度保留、房间不要', () => {
    expect(readLegacy({ run: RUN, defaultHash: 'old' }, 'new', true).run).toEqual({ ...RUN, room: null });
  });
});

describe('写入', () => {
  it('连着变好几次只写最后一次；flush 马上写掉', () => {
    vi.useFakeTimers();
    const m = memory(), w = createWriter(m, 'save', 300);
    w.schedule(() => ({ n: 1 }));
    w.schedule(() => ({ n: 2 }));
    expect(m.data.size).toBe(0);
    vi.advanceTimersByTime(300);
    expect(JSON.parse(m.data.get('save')!)).toEqual({ n: 2 });
    w.schedule(() => ({ n: 3 }));
    w.flush();
    expect(JSON.parse(m.data.get('save')!)).toEqual({ n: 3 });
    vi.advanceTimersByTime(1000);
    expect(JSON.parse(m.data.get('save')!)).toEqual({ n: 3 });
    vi.useRealTimers();
  });

  it('localStorage 抛错（隐私模式、存满了）：读是 null，写不抛', () => {
    const broken = browserStorage({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } });
    expect(broken.read('save')).toBeNull();
    expect(() => broken.write('save', '{}')).not.toThrow();
  });
});
