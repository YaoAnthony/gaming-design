import { describe, expect, it } from 'vitest';
import type { Note } from './chart';
import { judge, NoteTrack, POINTS, Scoreboard } from './score';

const W = { perfect: 60, good: 130 };
const note = (timeMs: number, lane: number, char: string): Note => ({ timeMs, lane, char, section: 0 });

describe('判定', () => {
  it('离拍点 60 毫秒以内 Perfect，130 以内 Good，再远不算；早晚一样', () => {
    expect([0, 60, -60, 61, 130, -130, 131].map(d => judge(d, W))).toEqual(['perfect', 'perfect', 'perfect', 'good', 'good', 'good', null]);
  });
});

describe('成绩', () => {
  it('连击遇到 Miss 归零，最高连击留着；比例按满分算', () => {
    const b = new Scoreboard(4);
    (['perfect', 'good', 'miss', 'perfect'] as const).forEach(j => b.add(j));
    expect(b).toMatchObject({ perfect: 2, good: 1, miss: 1, combo: 1, maxCombo: 2, last: 'perfect', points: 2 * POINTS.perfect + POINTS.good });
    expect(b.ratio).toBeCloseTo(0.65, 6);
  });

  it('每次判定都告诉在听的，带上是按出来的还是自动判的', () => {
    const b = new Scoreboard(2), heard: string[] = [];
    b.listen((j, by) => heard.push(`${j}/${by}`));
    b.add('good'); b.add('perfect', 'auto');
    expect(heard).toEqual(['good/press', 'perfect/auto']);
  });
});

describe('一段音符', () => {
  it('时间窗里按对了算打中，按得准是 Perfect；同一个音符只能打一次', () => {
    const b = new Scoreboard(2), t = new NoteTrack([note(1000, 0, '<'), note(1500, 1, '>')], b);
    expect(t.press(900, W, n => n.char === '>')).toBeNull();   // 方向不对
    expect(t.press(800, W, n => n.char === '<')).toBeNull();   // 太早
    expect(t.press(900, W, n => n.char === '<')).toMatchObject({ judgement: 'good', note: { timeMs: 1000 } });
    expect(t.press(950, W, n => n.char === '<')).toBeNull();   // 已经打掉了
    expect(t.press(1510, W, n => n.char === '>')?.judgement).toBe('perfect');
    expect(b).toMatchObject({ perfect: 1, good: 1, combo: 2 });
  });

  it('两个都在时间窗里，打离现在最近的那个', () => {
    const t = new NoteTrack([note(1000, 0, 'x'), note(1200, 0, 'x')], new Scoreboard(2));
    t.press(1120, W, () => true);
    expect([...t.done]).toEqual([1]);
  });

  it('过了时间窗没打的算漏，只记一次；打掉的不算', () => {
    const b = new Scoreboard(3), t = new NoteTrack([note(1000, 0, 'x'), note(1100, 0, 'x'), note(3000, 0, 'x')], b);
    t.press(1000, W, () => true);
    expect(t.sweep(1200, W)).toEqual([]);    // 第二个还在窗里
    expect(t.sweep(1300, W).map(n => n.timeMs)).toEqual([1100]);
    expect(t.sweep(1400, W)).toEqual([]);
    expect(t.sweep(9999, W).map(n => n.timeMs)).toEqual([3000]);
    expect(b).toMatchObject({ perfect: 1, miss: 2, combo: 0 });
  });

  it('长按：按到尾巴是 Perfect；提前松开是 Miss；头漏了尾巴也算漏', () => {
    const hold = (t: number): Note => ({ ...note(t, 0, 'H'), holdMs: 1000 });
    const b = new Scoreboard(6), t = new NoteTrack([hold(1000), hold(4000), hold(7000)], b);
    t.press(1000, W, () => true);
    expect(t.holding).toHaveLength(1);
    expect(t.holds(1500, W, () => true)).toEqual({ kept: [], dropped: [] });   // 还按着
    expect(t.holds(1900, W, () => false).kept).toHaveLength(1);                // 离尾巴不到一个 Good 窗：松手也算按完
    t.press(4000, W, () => true);
    expect(t.holds(4400, W, () => false).dropped).toHaveLength(1);             // 提前松开
    t.sweep(9999, W);                                                          // 第三个头都没按
    expect(b).toMatchObject({ perfect: 3, miss: 3 });
  });
});
