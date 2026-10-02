import { describe, expect, it } from 'vitest';
import { landingSpot, type SpotQuery } from './popOutSpot';

// 6x5 的房间：四周一圈墙，里面是空的，(3,3) 多一块砖
const ROWS = ['######', '#....#', '#....#', '#..#.#', '######'];
const T = 32;
const query = (want: { x: number; y: number }, bodyH = 30): SpotQuery => ({
  want, bodyW: 24, bodyH, tile: T, room: { x0: 0, y0: 0, w: 6, h: 5 },
  blocked: (cx, cy) => ROWS[cy]?.[cx] !== '.',
  hazard: () => false,
});

describe('走回画面的落点', () => {
  it('想落的地方站得下：就落在那', () => {
    expect(landingSpot(query({ x: 70, y: 60 }))).toEqual({ x: 70, y: 60 });
  });

  it('想落在地板里：挪到正上方那格，脚踩在格子底边', () => {
    expect(landingSpot(query({ x: 2.5 * T, y: 4.5 * T }))).toEqual({ x: 2.5 * T, y: 4 * T - 15 });
  });

  it('想落在砖里：挪到最近的空格', () => {
    const s = landingSpot(query({ x: 3.5 * T, y: 3.5 * T }))!;
    expect(ROWS[Math.floor(s.y / T)][Math.floor(s.x / T)]).toBe('.');
    expect(Math.hypot(s.x - 3.5 * T, s.y - 3.5 * T)).toBeLessThanOrEqual(T + 1);
  });

  it('想落在房间外面：拉回房间里', () => {
    const s = landingSpot(query({ x: -200, y: 60 }))!;
    expect(Math.floor(s.x / T)).toBe(1);
  });

  it('人比一格高：头顶那格也要是空的', () => {
    const s = landingSpot(query({ x: 3.5 * T, y: 2.6 * T }, 50))!;   // 两格高的人站不进 (3,2)：脚下是砖没关系，但要整个人都在空格里
    const top = Math.floor((s.y - 25 + 0.01) / T), bottom = Math.floor((s.y + 25 - 0.01) / T);
    for (let cy = top; cy <= bottom; cy++) expect(ROWS[cy][Math.floor(s.x / T)]).toBe('.');
  });

  it('不落在尖刺里：挪到最近的安全格；全是尖刺才落进去', () => {
    const spikes = (cx: number, cy: number) => cy === 3 && cx <= 2;   // (1,3)、(2,3) 是尖刺
    const s = landingSpot({ ...query({ x: 1.5 * T, y: 4.5 * T }), hazard: spikes })!;
    expect(spikes(Math.floor(s.x / T), Math.floor(s.y / T))).toBe(false);
    expect(landingSpot({ ...query({ x: 70, y: 60 }), hazard: () => true })).toEqual({ x: 70, y: 60 });
  });

  it('整个房间都站不下', () => {
    expect(landingSpot({ ...query({ x: 70, y: 60 }), blocked: () => true })).toBeNull();
  });
});
