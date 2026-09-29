import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { Terrain, type TerrainHost } from '@/game/terrain/Terrain';
import { FuseNet } from './Fuse';

/** 假场景：地形和引线用到的 tilemap / 图片 / 粒子 / 补间 / 计时器，时钟手动推进 */
function fakeScene() {
  let now = 0;
  const timers: { at: number; cb: () => void; removed: boolean; hasDispatched: boolean; remove(): void }[] = [];
  const obj = (): Record<string, unknown> => { const o: Record<string, unknown> = { x: 0, y: 0, list: [] }; ['setDepth', 'setScale', 'setBlendMode', 'setTint', 'setAlpha', 'setOrigin'].forEach(k => { o[k] = () => o; }); o.destroy = () => {}; o.add = (c: unknown) => (o.list as unknown[]).push(c); return o; };
  const layer = { setCollision() {}, putTileAt() { return {}; }, removeTileAt() {} };
  const scene = {
    make: { tilemap: () => ({ addTilesetImage: () => ({}), createLayer: () => layer }) },
    add: { container: obj, image: obj, circle: obj, particles: obj },
    tweens: { add: () => ({ remove() {} }) },
    time: {
      delayedCall: (ms: number, cb: () => void) => {
        const t = { at: now + ms, cb, removed: false, hasDispatched: false, remove() { t.removed = true; } };
        timers.push(t);
        return t;
      },
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = timers.filter(t => !t.removed && !t.hasDispatched && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      now = next.at; next.hasDispatched = true; next.cb();
    }
    now = end;
  };
  return { scene, advance };
}

describe('引线一跳跳烧过去', () => {
  it('点燃一头：整条引线按顺序烧完，经过的碎岩烧没、岩石裂成碎岩', () => {
    const rows = ['RRRRRRRR', 'R......R', 'RrRrrrrR', 'RRRRRRRR'];
    const fuse = ['........', '........', '.WWWWWW.', '........'];
    const { scene, advance } = fakeScene();
    const terrain = new Terrain({ scene } as unknown as TerrainHost, rows, { tile: 32, explosionRadius: 1.5, chunkGravity: 1400, chunkMaxFall: 700 });
    const net = new FuseNet(scene as never, fuse, { tile: 32, delayMs: 90 });
    const burned: number[] = [];
    const n = net.ignite(net.endsAt(1, 2), terrain, cells => cells.forEach(c => burned.push(c.x)));
    expect(n).toBe(6);
    advance(1000);
    expect(burned).toEqual([1, 2, 3, 4, 5, 6]);
    expect(terrain.grid[2].join('')).toBe('R.r....R');
    expect(net.has(6, 2)).toBe(false);
  });

  it('按 R 重置任何一个房间：整张图正在烧的引线全部停下，之后还能从头再点', () => {
    const rows = ['RRRRRRRRRRRR', 'R..........R', 'RrrrrrrrrrrR', 'RRRRRRRRRRRR'];
    const fuse = ['............', '............', '.WWWWWWWWWW.', '............'];
    const { scene, advance } = fakeScene();
    const terrain = new Terrain({ scene } as unknown as TerrainHost, rows, { tile: 32, explosionRadius: 1.5, chunkGravity: 1400, chunkMaxFall: 700 });
    const net = new FuseNet(scene as never, fuse, { tile: 32, delayMs: 90 });
    net.ignite(net.endsAt(1, 2), terrain);
    advance(200);                              // 烧了 3 格（第 0、1、2 跳）
    net.resetRect(8, 0, 4, 4);                 // 重置右边那一小块（火还没烧到那里）
    terrain.resetRect(8, 0, 4, 4);
    advance(5000);
    expect(terrain.grid[2].join('')).toBe('R...rrrrrrrR');   // 火停在第 3 格，后面没再烧
    expect(net.ignite(net.endsAt(10, 2), terrain)).toBeGreaterThan(0);   // 没烧完的那段还能再点
  });
});

