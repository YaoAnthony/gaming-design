import { describe, expect, it } from 'vitest';
import { readRun } from '@/redux/persist';
import { EMPTY_RUN } from '@/redux/slices/runSlice';

describe('读存档', () => {
  const saved = { ...EMPTY_RUN, active: true, floorId: 'f2', room: { rx: 1, ry: 2 }, stage: 2, carry: { hat: true, carry: 'candle', other: { n: 1 } }, stats: { jumps: 4, destroyed: 7 }, flags: { seen: true as const }, realm: 'deep' as const, deep: { levelId: 'desk' } };

  it('完整的存档原样读回来', () => {
    expect(readRun(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('版本不对、没在进行中的不要', () => {
    expect(readRun({ ...saved, version: 0 })).toBeUndefined();
    expect(readRun({ ...saved, active: false })).toBeUndefined();
    expect(readRun(null)).toBeUndefined();
  });

  it('字段不对的用默认值', () => {
    expect(readRun({ version: saved.version, active: true, room: { rx: 'a' }, stage: -3, carry: 5, stats: null, flags: { a: 1, b: true }, realm: 'nowhere', deep: {} }))
      .toEqual({ ...EMPTY_RUN, active: true, flags: { b: true } });
  });

  it('第 1 版存档（帽子、道具是单独的字段）：读进来转成 carry，别的不变', () => {
    const v1 = { version: 1, active: true, floorId: 'f2', room: { rx: 1, ry: 2 }, stage: 2, hat: true, held: 'candle', stats: { jumps: 4, destroyed: 7 }, flags: {}, realm: 'flat', deep: null };
    expect(readRun(v1)).toEqual({ ...EMPTY_RUN, active: true, floorId: 'f2', room: { rx: 1, ry: 2 }, stage: 2, carry: { hat: true, carry: 'candle' }, stats: { jumps: 4, destroyed: 7 } });
    expect(readRun({ ...v1, hat: false, held: null })?.carry).toEqual({});
  });

  it('不认识的版本不要', () => {
    expect(readRun({ ...saved, version: 99 })).toBeUndefined();
  });
});
