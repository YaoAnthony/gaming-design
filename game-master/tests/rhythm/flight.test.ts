import { describe, expect, it } from 'vitest';
import type { Note } from '@/rhythm/chart';
import { noteProgress, struck } from '@/rhythm/flight';

const orb: Note = { timeMs: 5000, lane: 1, char: 'o', section: 0 }, bar: Note = { ...orb, char: '_' };

describe('音符在路上', () => {
  it('提前 travel 毫秒出发，正好在拍点上到主角跟前', () => {
    expect([3000, 4000, 5000, 5500].map(t => noteProgress(orb, t, 2000))).toEqual([0, 0.5, 1, 1.25]);
  });

  it('躲：同一条道、到了那一排才算打中；别的道、还没到、已经过去都不算', () => {
    expect(struck(orb, 1, 0, 5000, 80, 0.6)).toBe(true);
    expect(struck(orb, 2, 0, 5000, 80, 0.6)).toBe(false);
    expect(struck(orb, 1, 0, 4900, 80, 0.6)).toBe(false);
    expect(struck(orb, 1, 0, 5100, 80, 0.6)).toBe(false);
  });

  it('躲：弹幕跳起来也躲不过；横杠跳得够高就过去了', () => {
    expect(struck(orb, 1, 2, 5000, 80, 0.6)).toBe(true);
    expect(struck(bar, 1, 0.3, 5000, 80, 0.6)).toBe(true);
    expect(struck(bar, 1, 0.7, 5000, 80, 0.6)).toBe(false);
  });
});
