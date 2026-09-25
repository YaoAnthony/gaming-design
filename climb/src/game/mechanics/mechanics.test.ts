import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import type { Floor, WorldModel } from '@/type';
import { Entities } from '@/game/registry/registry';
import { floorMechanicOf, globalMechanicsOf, Mechanics } from './define';

/** 一个房间的小层：entities 那一行放物件字符 */
function floorWith(entityRow: string, extra: Partial<Floor> = {}, model: Partial<WorldModel> = {}): Floor {
  const w = entityRow.length;
  return {
    id: 'f', name: 'f',
    model: { roomW: w, roomH: 1, layout: [['A']], rooms: { A: ['.'.repeat(w)] }, entities: { A: [entityRow] }, ...model },
    ...extra,
  };
}
const ids = (f: Floor) => globalMechanicsOf(f).map(m => m.id);

describe('机制注册表', () => {
  it('层机制：没写 mode 默认平台跳', () => {
    expect(floorMechanicOf(floorWith('.P.')).id).toBe('platform');
  });

  it('层机制：旧地图的 mode "topdown" 认成吃豆人', () => {
    expect(floorMechanicOf(floorWith('...', { mode: 'topdown' })).id).toBe('pacman');
  });

  it('层机制：没写 mode 但放了豆子，自动是吃豆人', () => {
    expect(floorMechanicOf(floorWith('.o.')).id).toBe('pacman');
  });

  it('层机制：明确选了平台跳，放了豆子也不改', () => {
    expect(floorMechanicOf(floorWith('.o.', { mode: 'platform' })).id).toBe('platform');
  });

  it('通用机制：放了物件才启用；携带、帽子每层都启用', () => {
    expect(ids(floorWith('...'))).toEqual(['carry', 'hat']);
    expect(ids(floorWith('.K.'))).toEqual(['boss', 'carry', 'hat']);
    expect(ids(floorWith('NVG'))).toEqual(['goal', 'npc', 'carry', 'slider', 'hat']);
    expect(ids(floorWith('.bD'))).toEqual(['carry', 'hat', 'pushBlock']);
    expect(ids(floorWith('.qQ'))).toEqual(['carry', 'hat', 'pushBlock']);
  });

  it('通用机制：旧的 roomFlags.boss 也启用 Boss；有锁组启用钥匙与门', () => {
    expect(ids(floorWith('...', {}, { roomFlags: { A: { boss: true } } }))).toContain('boss');
    expect(ids(floorWith('...', {}, { locks: { groups: [{ id: 1, color: 0 }], doors: {}, keys: {} } }))).toContain('locks');
  });

  it('物件记着自己属于哪个机制；核心物件没有', () => {
    expect(Entities.get('o')?.mechanic).toBe('pacman');
    expect(Entities.get('K')?.mechanic).toBe('boss');
    expect(Entities.get('P')?.mechanic).toBeNull();
    expect(Mechanics.get('pacman')?.entityIds).toEqual(['o', 'O', 'H', 'F', '~']);
  });

  it('层机制的物件默认按机制名分区，通用机制的归「物件」', () => {
    expect(Entities.get('o')?.group).toBe('吃豆人');
    expect(Entities.get('K')?.group).toBe('物件');
  });
});
