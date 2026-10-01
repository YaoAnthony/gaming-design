import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { Terrain, type TerrainHost } from './Terrain';
import { defineTile, Traits } from '@/game/registry/registry';

// 测试专用：会连锁、每跳延迟的锚点砖（游戏里没有，用来验证按房间取消延迟连锁）
defineTile({ id: 'Y', name: '测试延迟链', color: 0xffffff, frame: 0 }, Traits.Solid, Traits.Anchor, Traits.Destructible(0), Traits.Chain, Traits.Delay(100));

/** 假场景：Terrain 只用到 tilemap、container、image 和 delayedCall。时钟手动推进 */
function fakeHost(hooks: Partial<TerrainHost> = {}) {
  let now = 0;
  const timers: { at: number; cb: () => void; removed: boolean; hasDispatched: boolean }[] = [];
  const layer = { setCollision() {}, putTileAt() { return {}; }, removeTileAt() {} };
  const scene = {
    make: { tilemap: () => ({ addTilesetImage: () => ({}), createLayer: () => layer }) },
    add: {
      container: () => { const c = { x: 0, y: 0, list: [] as unknown[], setDepth: () => c, add: (o: unknown) => { c.list.push(o); }, destroy() {} }; return c; },
      image: () => ({ x: 0, y: 0 }),
    },
    time: {
      delayedCall: (ms: number, cb: () => void) => {
        const t = { at: now + ms, cb, removed: false, hasDispatched: false, remove() { t.removed = true; } };
        timers.push(t);
        return t;
      },
    },
  };
  const advance = (ms: number) => {
    now += ms;
    timers.filter(t => !t.removed && !t.hasDispatched && t.at <= now).sort((a, b) => a.at - b.at).forEach(t => { t.hasDispatched = true; t.cb(); });
  };
  return { host: { ...hooks, scene } as unknown as TerrainHost, advance };
}

const make = (rows: string[], hooks: Partial<TerrainHost> = {}) => {
  const f = fakeHost(hooks);
  return { terrain: new Terrain(f.host, rows, { tile: 32, explosionRadius: 1.5, chunkGravity: 1400, chunkMaxFall: 700 }), advance: f.advance };
};
const fall = (t: Terrain, frames = 600) => { for (let i = 0; i < frames && t.chunks.length; i++) t.updateChunks(1 / 60); };
const count = (t: Terrain, id: string) => t.grid.flat().filter(c => c === id).length + t.chunks.reduce((n, ch) => n + ch.cells.filter(c => c.id === id).length, 0);

// 上下两个 5×5 的房间：上面房间 (2,1) 有一格沙土，下面有个通道一直通到底
const TWO_ROOMS = ['RRRRR', 'R.S.R', 'R...R', 'R...R', 'RR.RR', 'RR.RR', 'R...R', 'R...R', 'R...R', 'RRRRR'];

describe('房间重置按材料来源算', () => {
  it('上面房间的沙土掉到下面房间：重置上面房间时收回来，下面不留一份', () => {
    const { terrain } = make(TWO_ROOMS);
    terrain.destroyCellsForce([{ x: 2, y: 0 }]);   // 撑着沙土的岩石没了
    fall(terrain);
    expect(terrain.grid[8][2]).toBe('S');
    terrain.resetRect(0, 0, 5, 5);
    expect(terrain.grid[1][2]).toBe('S');
    expect(terrain.grid[0][2]).toBe('R');
    expect(terrain.grid[8][2]).toBe('.');
    expect(count(terrain, 'S')).toBe(1);
  });

  it('别的房间的材料落在这个房间：重置这个房间时它回原处，不会消失', () => {
    const { terrain } = make(TWO_ROOMS);
    terrain.destroyCellsForce([{ x: 2, y: 0 }]);
    fall(terrain);
    terrain.resetRect(0, 5, 5, 5);                 // 重置下面的房间
    expect(terrain.grid[8][2]).toBe('.');
    expect(count(terrain, 'S')).toBe(1);           // 回到了上面的原位（那里没撑住，会再掉下去，但不会丢）
  });

  it('还在掉的碎块：属于被重置的房间就收回；路过这个房间的外来碎块回原处', () => {
    const { terrain } = make(TWO_ROOMS);
    terrain.destroyCellsForce([{ x: 2, y: 0 }]);
    for (let i = 0; i < 12; i++) terrain.updateChunks(1 / 60);   // 掉到一半
    expect(terrain.chunks.length).toBe(1);
    terrain.resetRect(0, 0, 5, 5);
    expect(terrain.chunks.length).toBe(0);
    expect(terrain.grid[1][2]).toBe('S');
  });
});

describe('碎块叠碎块', () => {
  it('快的沙土追上下面慢慢飘的纸：贴着纸一起下落，纸落地之前不会并进地形', () => {
    // (1,2) 碎岩撑着沙土 (2,2)，沙土下面挂着纸 (2,3)
    let falls = 0;   // 每次有碎块开始下落（包括"在半空并进地形又立刻重新掉下去"）都算一次
    const { terrain } = make(['RRRRR', 'R...R', 'RrS.R', 'R.Z.R', 'R...R', 'R...R', 'R...R', 'R...R', 'R...R', 'RRRRR'], { onChunkFall: () => { falls++; } });
    terrain.shake([{ x: 2, y: 3 }], 0);            // 纸松脱，开始飘
    terrain.destroyCellsForce([{ x: 1, y: 2 }]);   // 碎岩没了，沙土掉下去追上纸
    expect(terrain.chunks.length).toBe(2);
    let sandFirstAt = -1, paperFirstAt = -1;
    for (let f = 0; f < 1200 && terrain.chunks.length; f++) {
      terrain.updateChunks(1 / 60);
      const flat = terrain.grid.flat();
      if (sandFirstAt < 0 && flat.includes('S')) sandFirstAt = f;
      if (paperFirstAt < 0 && flat.includes('Z')) paperFirstAt = f;
    }
    expect(paperFirstAt).toBeGreaterThanOrEqual(0);
    expect(sandFirstAt).toBeGreaterThanOrEqual(paperFirstAt);
    expect(terrain.grid[8][2]).toBe('Z');
    expect(terrain.grid[7][2]).toBe('S');
    expect(falls).toBe(2);   // 纸一次、沙土一次：中途没有反复断裂
  });
});

describe('防火', () => {
  it('引线烧不动锁着的门；碎岩照常烧没', () => {
    const { terrain } = make(['RRRRR', 'R%r.R', 'RRRRR']);
    terrain.burnCells([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(terrain.grid[1][1]).toBe('%');
    expect(terrain.grid[1][2]).toBe('.');
  });
});

describe('重置时延迟连锁全图一起停', () => {
  it('从左边房间烧向右边房间：重置右边房间，整条链都停在还没烧到的地方', () => {
    const { terrain, advance } = make(['RRRRRRRRRR', 'R........R', 'RYYYYYYYYR', 'RRRRRRRRRR']);
    terrain.destroyCells(terrain.previewCells([{ x: 1, y: 2 }]));   // 第一格立刻烧掉，后面每 100ms 一格
    advance(250);                                                    // 烧到第 3 格
    terrain.resetRect(5, 0, 5, 4);
    advance(10_000);
    expect(terrain.grid[2].slice(1, 9).join('')).toBe('...YYYYY');
  });
});

describe('整组平移（移动方块）', () => {
  it('平移一格：材料跟着走；腾出来的格子上挂着的尖刺旁边没墙就碎掉', () => {
    const { terrain } = make(['RRRRRRR', 'R.X...R', 'R.rr..R', 'R.....R', 'RRRRRRR']);
    terrain.moveCells([{ x: 2, y: 2 }, { x: 3, y: 2 }], 1, 0);
    expect(terrain.grid[2].join('')).toBe('R..rr.R');
    expect(terrain.grid[1][2]).toBe('.');              // 尖刺下面那格空了、左右也没墙：碎掉
  });

  it('平移一格：尖刺旁边有沙土就改挂在沙土上；沙土下面被右移的那块补上，不掉', () => {
    const { terrain } = make(['RRRRRRR', 'R.XS..R', 'R.rr..R', 'R.....R', 'RRRRRRR']);
    terrain.moveCells([{ x: 2, y: 2 }, { x: 3, y: 2 }], 1, 0);
    expect(terrain.grid[1][2]).toBe('X');
    expect(terrain.hazardBoxes(2, 1)).toEqual([{ x: 20, y: 2, w: 12, h: 28 }]);   // 挂右边
    expect(terrain.chunks.map(ch => ch.cells.map(c => c.id).join(''))).toEqual([]);
  });

  it('平移之后重置：按来源，挪走的方块回到原位，新位置清空', () => {
    const { terrain } = make(['RRRRRR', 'R....R', 'R.r..R', 'RRRRRR']);
    terrain.moveCells([{ x: 2, y: 2 }], 1, 0);
    terrain.moveCells([{ x: 3, y: 2 }], 1, 0);
    expect(terrain.grid[2].join('')).toBe('R...rR');
    terrain.resetRect(0, 0, 6, 4);
    expect(terrain.grid[2].join('')).toBe('R.r..R');
  });
});


describe('尖刺改挂在旁边', () => {
  it('脚下被炸空、左边有墙：尖刺留着改挂左边，扎人的区域换成左边那一条', () => {
    const { terrain } = make(['RRRRR', 'R...R', 'RRX.R', 'R.r.R', 'RRRRR']);
    expect(terrain.hazardBoxes(2, 2)).toEqual([{ x: 2, y: 20, w: 28, h: 12 }]);   // 挂下面：底部那一条
    terrain.destroyCellsForce([{ x: 2, y: 3 }]);
    expect(terrain.grid[2][2]).toBe('X');
    expect(terrain.hazardBoxes(2, 2)).toEqual([{ x: 0, y: 2, w: 12, h: 28 }]);
  });

  it('两边都有墙：左右各一条窄的；墙一边没了换成另一边，两边都没了才碎', () => {
    const { terrain } = make(['RRRRR', 'R...R', 'RrXrR', 'R...R', 'RRRRR']);
    expect(terrain.hazardBoxes(2, 2)).toHaveLength(2);
    terrain.destroyCellsForce([{ x: 1, y: 2 }]);
    expect(terrain.hazardBoxes(2, 2)).toEqual([{ x: 20, y: 2, w: 12, h: 28 }]);
    terrain.destroyCellsForce([{ x: 3, y: 2 }]);
    expect(terrain.grid[2][2]).toBe('.');
  });
});

describe('引线穿过脆岩', () => {
  it('烧不没，像被爆炸震到一样整块松脱掉下来', () => {
    const { terrain } = make(['RRRRR', 'RBBBR', 'R...R', 'R...R', 'RRRRR']);
    const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
    terrain.burnCells(path);      // 和 Fuse.ignite 一样：先烧，再震
    terrain.shake(path, 0);
    expect(count(terrain, 'B')).toBe(3);
    fall(terrain);
    expect(terrain.grid[3].join('')).toBe('RBBBR');
  });
});
