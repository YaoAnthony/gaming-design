import { describe, expect, it } from 'vitest';
import type { LockCell } from '@/game/world/WorldModel';
import { doorCluster } from './cluster';

/** 字符画转门：数字 = 组号，'.' = 没有门 */
const doorsOf = (rows: string[]): LockCell[] => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === '.' ? [] : [{ x, y, group: Number(c) }])));
const all = () => true;

describe('钥匙门连锁', () => {
  it('从碰到的门出发，沿上下左右相邻的同色门往外传，记跳数', () => {
    const doors = doorsOf([
      '11..',
      '.1..',
      '.111',
    ]);
    const out = doorCluster(doors, { x: 0, y: 0 }, all);
    expect(out.map(d => [d.x, d.y, d.hop])).toEqual([[0, 0, 0], [1, 0, 1], [1, 1, 2], [1, 2, 3], [2, 2, 4], [3, 2, 5]]);
  });

  it('不同色的门挡住连锁；隔开的同色门是另一片，不开', () => {
    const doors = doorsOf([
      '1121',
      '....',
      '1...',
    ]);
    const out = doorCluster(doors, { x: 0, y: 0 }, all);
    expect(out.map(d => [d.x, d.y])).toEqual([[0, 0], [1, 0]]);
  });

  it('斜着挨着不算相连', () => {
    const out = doorCluster(doorsOf(['1.', '.1']), { x: 0, y: 0 }, all);
    expect(out.length).toBe(1);
  });

  it('已经开过 / 被炸掉的门不算，连锁也不从它身上传过去', () => {
    const doors = doorsOf(['111']);
    const out = doorCluster(doors, { x: 0, y: 0 }, d => d.x !== 1);
    expect(out.map(d => d.x)).toEqual([0]);
    expect(doorCluster(doors, { x: 1, y: 0 }, d => d.x !== 1)).toEqual([]);   // 碰到的这扇本身已经开了
  });
});
