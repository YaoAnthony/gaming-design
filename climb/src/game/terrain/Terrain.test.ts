import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import { Terrain } from './Terrain';

describe('Terrain 支撑检测', () => {
  it('连到岩石的泥土不会掉，悬空的会掉', () => {
    const rows = [
      'RRRRR',
      'R...R',
      'R.#.R',   // (2,2) 四周都是空气 → 悬空
      'R#..R',   // (1,3) 连着左边的 R
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
    const rows = ['RRRRR', 'R...R', 'R.#.R', 'R.X.R', 'RRRRR'];
    // (2,2) 泥土下面是尖刺、四周是空气 → 悬空；尖刺本身不会掉
    expect(Terrain.findUnsupported(rows)).toEqual([{ x: 2, y: 2 }]);
  });
});
