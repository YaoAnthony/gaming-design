import { describe, expect, it } from 'vitest';
import { FuseNet } from './Fuse';
import { fuseRows } from '@/game/world/WorldModel';
import type { WorldModel } from '@/type';

const grid = (rows: string[]) => {
  const h = rows.length, w = rows[0].length, cells = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'W') cells[y * w + x] = 1; }));
  return { cells, w, h };
};

describe('FuseNet（引线层）', () => {
  it('只有两端是端点，中间和分叉点不是', () => {
    const { cells, w, h } = grid(['WWWWW', '..W..', '..W..']);
    expect(FuseNet.isEnd(cells, w, h, 0, 0)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 4, 0)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 2, 2)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 1, 0)).toBe(false);
    expect(FuseNet.isEnd(cells, w, h, 2, 0)).toBe(false);
    expect(FuseNet.isEnd(cells, w, h, 0, 1)).toBe(false);   // 没有引线的格子
  });

  it('从一头点燃，跳数沿引线递增到另一头', () => {
    const { cells, w, h } = grid(['W....', 'W....', 'WWWW.']);
    const plan = FuseNet.plan(cells, w, h, [{ x: 0, y: 0 }]);
    const hop = (x: number, y: number) => plan.find(c => c.x === x && c.y === y)?.hop;
    expect(hop(0, 0)).toBe(0); expect(hop(0, 2)).toBe(2); expect(hop(3, 2)).toBe(5);
    expect(plan).toHaveLength(6);
  });

  it('爆炸半径内只找端点，中间段碰到也不点燃', () => {
    const { cells, w, h } = grid(['.......', '.WWWWW.', '.......']);
    expect(FuseNet.endsNear(cells, w, h, { x: 3, y: 1 }, 1.5)).toEqual([]);            // 正中间
    expect(FuseNet.endsNear(cells, w, h, { x: 1, y: 2 }, 1.5)).toEqual([{ x: 1, y: 1 }]); // 挨着左端
  });
});

describe('引线跨房间', () => {
  it('两个房间交界处相邻的引线拼成一条，从 A 的一头能烧到 B 的另一头', () => {
    const m: WorldModel = {
      roomW: 3, roomH: 2, layout: [['A', 'B']],
      rooms: { A: ['...', '...'], B: ['...', '...'] },
      fuse: { A: ['.WW', '...'], B: ['WW.', '...'] },   // A 的 (1,0)(2,0) 接 B 的 (0,0)(1,0)
    };
    const rows = fuseRows(m);
    expect(rows[0]).toBe('.WWWW.');
    const { cells, w, h } = grid(rows);
    expect(FuseNet.isEnd(cells, w, h, 2, 0)).toBe(false);   // A 的边缘格不是端头，它连着 B
    expect(FuseNet.isEnd(cells, w, h, 1, 0)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 4, 0)).toBe(true);
    const plan = FuseNet.plan(cells, w, h, [{ x: 1, y: 0 }]);
    expect(plan.find(c => c.x === 4 && c.y === 0)?.hop).toBe(3);
  });
});
