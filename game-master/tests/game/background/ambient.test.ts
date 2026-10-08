import { describe, expect, it } from 'vitest';
import { MIST, MOTE_COUNT, mistOffset, moteAt, roomSeed } from '@/game/background/ambientMath';
import { backgroundDef } from '@/asset/backgrounds';

describe('森林轻动效', () => {
  it('雾的采样坐标在横向、纵向房间边界连续', () => {
    for (const time of [0, 7.5, 10000]) {
      const a = mistOffset(1920, 640, time);
      const right = mistOffset(2880, 640, time);
      const below = mistOffset(1920, 1280, time);
      expect(a.x + 960 / MIST.scaleX).toBeCloseTo(right.x, 10);
      expect(a.y + 640 / MIST.scaleY).toBeCloseTo(below.y, 10);
    }
  });
  it('微光点长期保持在房间内，数量固定，亮度很低，重进房间可复现', () => {
    for (const room of 'ABCDEFGHIJKMNO') for (const time of [0, 1, 60, 100000]) {
      const seed = roomSeed(room);
      for (let i = 0; i < MOTE_COUNT; i++) {
        const mote = moteAt(i, seed, time);
        expect(mote.u).toBeGreaterThanOrEqual(0); expect(mote.u).toBeLessThan(1);
        expect(mote.v).toBeGreaterThanOrEqual(0); expect(mote.v).toBeLessThan(1);
        expect(mote.alpha).toBeGreaterThanOrEqual(0); expect(mote.alpha).toBeLessThanOrEqual(0.24);
        expect(moteAt(i, roomSeed(room), time)).toEqual(mote);
      }
    }
    expect(moteAt(0, 0, 0).alpha).toBe(0);
    expect(moteAt(2, roomSeed('A'), 2)).not.toEqual(moteAt(2, roomSeed('B'), 2));
  });
  it('只为森林开启，不改变原有洞穴、默认天空和旧图层的零视差', () => {
    for (const room of 'ABCDEFGHIJKMNO') {
      const background = backgroundDef('woodland-' + room.toLowerCase() + '-v1');
      expect(background.ambient).toBe('woodland');
      expect(background.layers.every(layer => layer.parallax === 0)).toBe(true);
    }
    expect(backgroundDef('sky').ambient).toBeUndefined();
    expect(backgroundDef('cave').ambient).toBeUndefined();
  });
});
