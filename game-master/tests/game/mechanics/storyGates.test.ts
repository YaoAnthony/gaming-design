// 剧情墙：地图里画成物件 Y，bake 成岩石；没有剧情墙的层原样不动
import { describe, expect, it } from 'vitest';
import { bakeGates } from '@/game/mechanics/story/Gates';
import type { WorldModel } from '@/type';

const model = (rooms: Record<string, string[]>, entities: Record<string, string[]>, layout: (string | null)[][]): WorldModel =>
  ({ roomW: 3, roomH: 2, layout, rooms, entities } as unknown as WorldModel);

describe('剧情墙', () => {
  it('Y 的那几格烘成岩石，返回它们在整层上的坐标', () => {
    const m = model({ A: ['...', '...'], B: ['...', '...'] }, { B: ['..Y', '..Y'] }, [['A', 'B']]);
    const r = bakeGates(m);
    expect(r.model.rooms.B).toEqual(['..R', '..R']);
    expect(r.model.rooms.A).toEqual(['...', '...']);
    expect(r.data).toEqual([{ x: 5, y: 0 }, { x: 5, y: 1 }]);
    expect(m.rooms.B).toEqual(['...', '...']);   // 原模型不改
  });

  it('没有剧情墙：同一个模型', () => {
    const m = model({ A: ['...', '...'] }, {}, [['A', null]]);
    expect(bakeGates(m).model).toBe(m);
  });
});
