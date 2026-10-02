import { describe, expect, it } from 'vitest';
import { bar, chartErrors, endMs, notesOf, repeat, sectionAt, sectionStarts, stepMs, type Chart } from './chart';
import { CHARTS } from './charts';

const TINY: Chart = {
  id: 't', audio: '', bpm: 120, offsetMs: 150, stepsPerBeat: 2,
  sections: [
    { mode: 'dodge', rows: ['....', '....', 'o...', '_o_.', '....', '....', '....', '....'] },
    { mode: 'dash', rows: ['..', '..', 'x.', '.x', '..', '..', '..', '..'] },
  ],
};

describe('谱面', () => {
  it('120 BPM、半拍一行：一步 250 毫秒；段与段首尾相接', () => {
    expect(stepMs(TINY)).toBe(250);
    expect(sectionStarts(TINY)).toEqual([150, 2150, 4150]);
    expect(endMs(TINY)).toBe(4150);
  });

  it('音符按时间排好，记着在第几段、是什么字符', () => {
    expect(notesOf(TINY)).toEqual([
      { timeMs: 650, lane: 0, char: 'o', section: 0 },
      { timeMs: 900, lane: 0, char: '_', section: 0 }, { timeMs: 900, lane: 1, char: 'o', section: 0 }, { timeMs: 900, lane: 2, char: '_', section: 0 },
      { timeMs: 2650, lane: 0, char: 'x', section: 1 },
      { timeMs: 2900, lane: 1, char: 'x', section: 1 },
    ]);
  });

  it('现在在第几段：没开始算第一段，结束了算最后一段', () => {
    expect([0, 150, 2149, 2150, 9999].map(ms => sectionAt(TINY, ms))).toEqual([0, 0, 0, 1, 1]);
  });

  it('查得出写错的地方', () => {
    expect(chartErrors(TINY, 1)).toEqual([]);
    const bad = (rows: string[], mode: Chart['sections'][number]['mode'] = 'dodge') => chartErrors({ ...TINY, sections: [{ mode, rows: [...repeat(['.'.repeat(rows[0].length)], 7), ...rows] }] }, 1);
    expect(chartErrors({ ...TINY, sections: [{ mode: 'dodge', rows: [...repeat(['....'], 7), 'o..'] }] }, 1)).toHaveLength(1);   // 字符数不对
    expect(bad(['ox..'])).toHaveLength(1);           // 这种玩法不认识的字符
    expect(bad(['oooo'])).toHaveLength(1);           // 整排都躲不掉
    expect(bad(['____'])).toEqual([]);               // 整排横杠能跳过去
    expect(bad(['<>..'], 'saber')).toHaveLength(1);  // 一次只能砍一个
    expect(bad(['xxx.'], 'mania')).toHaveLength(1);  // 一次最多按两条道
    expect(bad(['xx'], 'dash')).toHaveLength(1);
    expect(chartErrors({ ...TINY, sections: [{ mode: 'dodge', rows: ['o...', ...repeat(['....'], 7)] }] }, 1)).toHaveLength(1);   // 开头没空出来
    expect(chartErrors({ ...TINY, sections: [{ mode: 'dodge', rows: repeat(['....'], 7) }] }, 1)).toHaveLength(1);                // 不是整小节
  });

  it('bar：没写的步是空行', () => {
    expect(bar(2, 4, { 1: 'x.', 3: '.x' })).toEqual(['..', 'x.', '..', '.x']);
  });

  it('仓库里的谱面都写对了（每段开头空一小节）', () => {
    for (const c of CHARTS) expect(chartErrors(c, 4)).toEqual([]);
  });
});
