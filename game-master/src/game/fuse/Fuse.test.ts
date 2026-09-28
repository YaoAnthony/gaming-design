import { describe, expect, it } from 'vitest';
import { FuseNet } from './Fuse';
import { fuseRows, setFuseCell } from '@/game/world/WorldModel';
import { decodeFuse, encodeFuse, encodeFuseState, FUSE_ALL, FUSE_CHANNELS, fuseBit } from './channels';
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

describe('引线颜色（通道）', () => {
  // 0 号色（橙）横着一条，1 号色（蓝）竖着一条，在 (2,1) 交叉：那一格是 1|2 = 3
  const rows = ['..2..', 'WW3WW', '..2..'];
  const { w, h } = { w: 5, h: 3 };
  const cells = FuseNet.parse(rows, w, h);
  const ORANGE = fuseBit(0), BLUE = fuseBit(1);

  it('地图字符 ↔ 位掩码：W = 0 号色，老地图不变；十六进制写多色', () => {
    expect(decodeFuse('.')).toBe(0);
    expect(decodeFuse('W')).toBe(1);
    expect(decodeFuse('3')).toBe(3);
    expect(decodeFuse('?')).toBe(0);
    expect(encodeFuse(0)).toBe('.');
    expect(encodeFuse(1)).toBe('W');
    expect(encodeFuse(3)).toBe('3');
    for (let m = 0; m <= FUSE_ALL; m++) expect(decodeFuse(encodeFuse(m))).toBe(m);
    for (let m = 0; m <= FUSE_ALL; m++) expect(decodeFuse(encodeFuseState(m))).toBe(m);
    expect(decodeFuse('0')).toBe(0);   // 老存档
  });

  it('交叉点不连通：每种颜色只数同色邻居', () => {
    expect(FuseNet.neighbours(cells, w, h, 2, 1, ORANGE)).toBe(2);   // 左右两格橙
    expect(FuseNet.neighbours(cells, w, h, 2, 1, BLUE)).toBe(2);     // 上下两格蓝
    expect(FuseNet.isEnd(cells, w, h, 0, 1, ORANGE)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 2, 0, BLUE)).toBe(true);
    expect(FuseNet.isEnd(cells, w, h, 2, 0, ORANGE)).toBe(false);    // 那一格没有橙色
  });

  it('从橙色一头点，只烧橙色：烧过交叉点但不拐进蓝色', () => {
    const plan = FuseNet.plan(cells, w, h, [{ x: 0, y: 1 }], ORANGE);
    expect(plan.map(c => `${c.x},${c.y}`).sort()).toEqual(['0,1', '1,1', '2,1', '3,1', '4,1']);
  });

  it('在另一种颜色的格子上点：什么都不烧', () => {
    expect(FuseNet.plan(cells, w, h, [{ x: 2, y: 0 }], ORANGE)).toEqual([]);
  });

  it('端点只找同色的', () => {
    expect(FuseNet.endsNear(cells, w, h, { x: 1, y: 0 }, 1.5, ORANGE)).toEqual([{ x: 0, y: 1 }]);
    expect(FuseNet.endsNear(cells, w, h, { x: 1, y: 0 }, 1.5, BLUE)).toEqual([{ x: 2, y: 0 }]);
  });

  it('只有紫色会直接烧碎岩石', () => {
    expect(FUSE_CHANNELS.filter(c => c.shatter).map(c => c.name)).toEqual(['紫']);
  });

  it('两种颜色并排挨着也不相连', () => {
    const side = FuseNet.parse(['WW22'], 4, 1);
    expect(FuseNet.isEnd(side, 4, 1, 1, 0, ORANGE)).toBe(true);
    expect(FuseNet.isEnd(side, 4, 1, 2, 0, BLUE)).toBe(true);
    expect(FuseNet.plan(side, 4, 1, [{ x: 0, y: 0 }], ORANGE)).toHaveLength(2);
  });
});

describe('编辑器画引线：只动这一种颜色', () => {
  const model = (): WorldModel => ({ roomW: 3, roomH: 1, layout: [['A']], rooms: { A: ['...'] }, fuse: { A: ['...'] } });

  it('画两种颜色叠成交叉，擦一种另一种还在', () => {
    const m = model();
    setFuseCell(m, 'A', 1, 0, 0, true);
    expect(m.fuse!.A[0]).toBe('.W.');
    setFuseCell(m, 'A', 1, 0, 1, true);
    expect(m.fuse!.A[0]).toBe('.3.');
    setFuseCell(m, 'A', 1, 0, 0, false);
    expect(m.fuse!.A[0]).toBe('.2.');
    setFuseCell(m, 'A', 1, 0, 1, false);
    expect(m.fuse!.A[0]).toBe('...');
  });
});
