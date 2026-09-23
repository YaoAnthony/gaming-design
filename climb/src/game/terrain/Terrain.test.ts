import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import { Terrain } from './Terrain';
import { defineTile, Tiles, Traits } from '@/game/registry/registry';

// 测试专用：一种会连锁、只点两端、自动拼贴的砖块（游戏里没有，用来验证这些通用能力）
defineTile({ id: 'T', name: '测试连锁砖', color: 0xffffff, frame: 5, gameFrame: 21, autotile: true }, Traits.Solid, Traits.Destructible(1), Traits.Chain, Traits.Delay(90), Traits.EndsOnly);

describe('Terrain 支撑检测', () => {
  it('泥土没有重力：悬空也不掉；连着泥土的沙土被撑住，悬空的沙土会掉', () => {
    const rows = [
      'RRRRR',
      'R...R',
      'R.S.R',   // (2,2) 四周都是空气 → 悬空
      'R...R',
      'R.#.R',   // (2,4) 泥土悬空但不掉
      'R...R',
      'R#S.R',   // (2,6) 连着泥土 → 被撑住
      'RRRRR',
    ];
    const un = Terrain.findUnsupported(rows);
    expect(un).toEqual([{ x: 2, y: 2 }]);
  });

  it('脆岩和沙土也遵守同样的支撑规则', () => {
    expect(Terrain.findUnsupported(['RRRR', 'R.BR', 'RS.R', 'RRRR'])).toEqual([]);          // 都挨着 R
    expect(Terrain.findUnsupported(['RRRRR', 'R...R', 'R.S.R', 'R...R', 'RRRRR'])).toEqual([{ x: 2, y: 2 }]);
    expect(Terrain.findUnsupported(['RRRRR', 'R...R', 'R.B.R', 'R.#.R', 'RRRRR'])).toEqual([]); // 脆岩+泥土一串连到底部 R
  });

  it('尖刺不是实心的，不参与支撑也不会掉', () => {
    const rows = ['RRRRR', 'R...R', 'R.S.R', 'R.X.R', 'RRRRR'];
    // (2,2) 沙土下面是尖刺、四周是空气 → 悬空；尖刺本身不会掉
    expect(Terrain.findUnsupported(rows)).toEqual([{ x: 2, y: 2 }]);
  });
});

describe('Terrain.computeChain（导火索连锁）', () => {
  const cell = (x: number, y: number, id: string) => ({ x, y, id, def: Tiles.get(id)! });

  it('沿同一种材质任意远传导，跳数按 BFS 距离递增', () => {
    // 一条弯折的导火索：(1,1)->(1,2)->(1,3)->(2,3)->(3,3)
    const grid = ['R R R R R'.split(' '), ['R', 'T', '.', '.', 'R'], ['R', 'T', '.', '.', 'R'], ['R', 'T', 'T', 'T', 'R'], ['R', 'R', 'R', 'R', 'R']];
    const seeds = [cell(1, 1, 'T')];
    const out = Terrain.computeChain(grid, seeds);
    const hop = (x: number, y: number) => out.find(c => c.x === x && c.y === y)?.hop;
    expect(hop(1, 1)).toBe(0);
    expect(hop(1, 2)).toBe(1);
    expect(hop(1, 3)).toBe(2);
    expect(hop(2, 3)).toBe(3);
    expect(hop(3, 3)).toBe(4);
    expect(out).toHaveLength(5);
  });

  it('不会波及路径以外的不同材质（哪怕紧挨着）', () => {
    const grid = [
      'RRRRR'.split(''),
      ['R', 'T', 'T', '#', 'R'],   // (3,1) 是泥土，紧挨着导火索但不是同一种材质
      'RRRRR'.split(''),
    ];
    const out = Terrain.computeChain(grid, [cell(1, 1, 'T')]);
    expect(out.map(c => `${c.x},${c.y}`).sort()).toEqual(['1,1', '2,1']);
    expect(out.some(c => c.x === 3 && c.y === 1)).toBe(false);
  });

  it('不会连锁的材质（比如泥土）只摧毁种子本身，不扩散', () => {
    const grid = ['RRR'.split(''), ['R', '#', 'R'], 'RRR'.split('')];
    const out = Terrain.computeChain(grid, [cell(1, 1, '#')]);
    expect(out).toEqual([{ x: 1, y: 1, id: '#', def: Tiles.get('#'), hop: 0 }]);
  });
});

describe('Terrain.isChainEnd（导火索只点两端）', () => {
  const grid = [
    'RRRRRRR'.split(''),
    ['R', 'T', 'T', 'T', 'T', 'T', 'R'],   // 一条横向导火索 (1,1)..(5,1)
    ['R', '.', '.', 'T', '.', '.', 'R'],   // (3,2) 从中间往下分叉
    ['R', '.', '.', 'T', '.', '.', 'R'],   // (3,3) 分叉的尾端
    'RRRRRRR'.split(''),
  ];
  it('两端和分叉尾端是端点', () => {
    expect(Terrain.isChainEnd(grid, 1, 1)).toBe(true);
    expect(Terrain.isChainEnd(grid, 5, 1)).toBe(true);
    expect(Terrain.isChainEnd(grid, 3, 3)).toBe(true);
  });
  it('中间段和分叉点不是端点', () => {
    expect(Terrain.isChainEnd(grid, 2, 1)).toBe(false);
    expect(Terrain.isChainEnd(grid, 3, 1)).toBe(false);
    expect(Terrain.isChainEnd(grid, 3, 2)).toBe(false);
  });
  it('孤立的一格既是头也是尾', () => {
    expect(Terrain.isChainEnd([['T']], 0, 0)).toBe(true);
  });
});

describe('Terrain.maskAt / frameAt（导火索自动拼贴）', () => {
  const base = Tiles.get('T')!.frame;
  const grid = [
    '.....'.split(''),
    ['.', 'T', 'T', 'T', '.'],   // 横线：(1,1) 左端头，(2,1) 直线，(3,1) 右端头
    ['.', '.', 'T', '.', '.'],   // (2,2) 从中间往下 → (2,1) 变成 T 形
    ['.', 'T', 'T', 'T', '.'],   // (2,3) 十字：上 + 左 + 右 + 下
    ['.', '.', 'T', '.', '.'],
  ];
  it('端头、直线、拐角、三岔、十字都能算出正确掩码', () => {
    expect(Terrain.maskAt(grid, 1, 1)).toBe(2);           // 只有右 → I 形端头
    expect(Terrain.maskAt(grid, 2, 1)).toBe(2 | 4 | 8);   // 右 下 左 → T 形
    expect(Terrain.maskAt(grid, 2, 2)).toBe(1 | 4);       // 上 下 → 竖直线
    expect(Terrain.maskAt(grid, 2, 3)).toBe(15);          // 十字 / 井字交点
    expect(Terrain.maskAt(grid, 1, 3)).toBe(2);           // 左端头
    expect(Terrain.maskAt(grid, 2, 4)).toBe(1);           // 下端头
  });
  it('自动拼贴材质的帧 = 起始帧 + 掩码；普通材质不受影响', () => {
    expect(Terrain.frameAt(grid, 2, 3, 'editor')).toBe(base + 15);
    expect(Terrain.frameAt(grid, 1, 1, 'editor')).toBe(base + 2);
    expect(Terrain.frameAt([['#', '#']], 0, 0)).toBe(Tiles.get('#')!.frame);
    expect(Terrain.frameAt([['.']], 0, 0)).toBe(-1);
  });
  it('L 形：只有右和下', () => {
    const l = [['T', 'T'], ['T', '.']];
    expect(Terrain.maskAt(l, 0, 0)).toBe(2 | 4);
  });
});

describe('导火索在游戏里用伪装帧', () => {
  it('编辑器视角用清晰帧，游戏视角用伪装帧，掩码相同', () => {
    const grid = [['T', 'T', 'T']];
    const d = Tiles.get('T')!;
    expect(Terrain.frameAt(grid, 1, 0, 'editor')).toBe(d.frame + (2 | 8));
    expect(Terrain.frameAt(grid, 1, 0, 'game')).toBe(d.gameFrame + (2 | 8));
    expect(d.gameFrame).not.toBe(d.frame);
  });
  it('没设 gameFrame 的砖块两种视角一样', () => {
    const grid = [['#']];
    expect(Terrain.frameAt(grid, 0, 0, 'game')).toBe(Terrain.frameAt(grid, 0, 0, 'editor'));
  });
});

describe('Terrain.findLooseGroups（脆岩松脱）', () => {
  it('爆炸范围外一圈的脆岩整块松脱，相连的一起；更远的不动', () => {
    const grid = [
      'RRRRRRRRR'.split(''),
      ['R', '.', '.', 'B', 'B', '.', '.', 'B', 'R'],   // (3,1)(4,1) 一组，(7,1) 太远
      ['R', '.', '.', '.', 'B', '.', '.', '.', 'R'],   // (4,2) 和上面相连
      'RRRRRRRRR'.split(''),
    ];
    const groups = Terrain.findLooseGroups(grid, [{ x: 1, y: 1 }], 1.5);   // 中心 (1,1)，半径 1.5 + 感应 1 = 2.5 → 够到 (3,1)
    expect(groups).toHaveLength(1);
    expect(groups[0].map(c => `${c.x},${c.y}`).sort()).toEqual(['3,1', '4,1', '4,2']);
  });
  it('泥土不会松脱', () => {
    expect(Terrain.findLooseGroups([['#', '#']], [{ x: 0, y: 0 }], 2)).toEqual([]);
  });
});
