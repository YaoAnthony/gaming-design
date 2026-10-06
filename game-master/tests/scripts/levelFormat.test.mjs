import { describe, expect, it } from 'vitest';
import { compileLevel, parseLevel, stitch } from '../../scripts/levelFormat.mjs';

/** 两个 4x3 的房间左右相连：A 里出生点、钥匙、门，B 里怪物和城堡 */
const LEVEL = `
# 注释
floor t1
name Test
place Somewhere
size 4 3
group 1 #4cc9f0
flag B fog
layout
AB

room A
RRRR
P1!.
RRRR

room B
RRRR
.MT.
RRRR

room A fuse
....
...W
....
`;

const build = text => {
  const { lv, errors } = parseLevel(text);
  const c = compileLevel(lv);
  return { lv, ...c, errors: [...errors, ...c.errors] };
};

describe('文字关卡', () => {
  it('编译成 world.json 的一层：砖块、物件、钥匙、门、引线各在各的层', () => {
    const { floor, errors } = build(LEVEL);
    expect(errors).toEqual([]);
    expect(floor).toMatchObject({ id: 't1', name: 'Test', place: 'Somewhere' });
    const m = floor.model;
    expect(m.roomW).toBe(4);
    expect(m.layout).toEqual([['A', 'B']]);
    expect(m.rooms.A).toEqual(['RRRR', '....', 'RRRR']);
    expect(m.entities.A[1]).toBe('P...');
    expect(m.locks.keys.A[1]).toBe('.1..');
    expect(m.locks.doors.A[1]).toBe('..1.');
    expect(m.locks.groups).toEqual([{ id: 1, color: 0x4cc9f0 }]);
    expect(m.entities.B[1]).toBe('.MT.');
    expect(m.fuse.A[1]).toBe('...W');
    expect(m.fuse.B).toEqual(['....', '....', '....']);   // 没画的房间补空
    expect(m.roomFlags).toEqual({ B: { fog: true } });
  });

  it('拼整层字符画', () => {
    const { lv } = build(LEVEL);
    expect(stitch(lv).split('\n')[1]).toBe('P1!..MT.');
  });

  it('行数、宽度不对，不认识的字符，都报错', () => {
    expect(build(LEVEL.replace('P1!.', 'P1!')).errors.some(e => e.includes('3 个字符'))).toBe(true);
    expect(build(LEVEL.replace('.MT.', '.MT~')).errors.some(e => e.includes("'~'"))).toBe(true);
  });

  it('出生点要正好一个；钥匙和门要有 group', () => {
    expect(build(LEVEL.replace('P1!.', '.1!.')).errors.some(e => e.includes('出生点'))).toBe(true);
    expect(build(LEVEL.replace('group 1 #4cc9f0\n', '')).errors.length).toBeGreaterThanOrEqual(2);
  });

  it('移动方块只能画在能搬的砖上', () => {
    const text = LEVEL.replace('room A fuse', 'room A movers\n....\n....\n..v.\n\nroom A fuse').replace('room A\nRRRR\nP1!.\nRRRR', 'room A\nRRRR\nP1!.\nRRSR');
    expect(build(text).errors.some(e => e.includes('移动方块'))).toBe(true);
  });

  it('房间交界一边空一边堵、外沿有空气，给提醒', () => {
    const { warnings } = build(LEVEL);
    expect(warnings.some(w => w.includes('A|B') && w.includes('左边空、右边堵'))).toBe(false);
    expect(warnings.some(w => w.includes('B 右边沿'))).toBe(true);   // B 的右边是空的，外面没房间
    const blocked = build(LEVEL.replace('.MT.', 'RMT.'));
    expect(blocked.warnings.some(w => w.includes('A|B') && w.includes('左边空、右边堵'))).toBe(true);
  });
});
