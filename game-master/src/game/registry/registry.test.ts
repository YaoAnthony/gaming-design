import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { classify, Entities, Tiles } from './registry';

describe('注册表', () => {
  it('砖块能力由特征组合决定', () => {
    const cracked = Tiles.get('r')!, rock = Tiles.get('R')!, brittle = Tiles.get('B')!, spikes = Tiles.get('X')!;
    expect(cracked).toMatchObject({ solid: true, destructible: true, canFall: false, anchor: true });   // 碎岩没有重力
    expect(rock).toMatchObject({ solid: true, anchor: true, canFall: false, destructible: false });
    expect(brittle).toMatchObject({ looseOnBlast: true, blastSensitivity: 1, destructible: false });
    expect(spikes).toMatchObject({ solid: false, hazard: 'death.spikes' });
    expect(Tiles.get('Z')).toMatchObject({ solid: true, looseOnBlast: true, floatSpeed: 55, destructible: false });
  });

  it('物件与砖块分开归类，未知字符当空气', () => {
    expect(classify('M').kind).toBe('entity');
    expect(classify('r').kind).toBe('tile');
    expect(classify('?')).toMatchObject({ kind: 'tile', def: { id: '.' } });
    expect(Entities.get('P')?.unique).toBe(true);
  });

  it('重复注册会报错', () => {
    expect(() => Tiles.register({ ...Tiles.get('r')! })).toThrow(/重复注册/);
  });
});
