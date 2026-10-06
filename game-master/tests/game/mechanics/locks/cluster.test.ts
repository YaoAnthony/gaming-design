import { describe, expect, it } from 'vitest';
import type { LockCell } from '@/game/world/WorldModel';
import { doorCluster, touchedDoor } from '@/game/mechanics/locks/cluster';

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

describe('钥匙碰到门', () => {
  const T = 32, TOUCH = 3;
  // 第 2 行是一排门：0~2 列是 1 组，第 3 列是 2 组
  const doors = doorsOf([
    '....',
    '....',
    '1112',
  ]);
  /** 一把钥匙：左上角 (x, y)，宽 24 高 18（地上钥匙的碰撞框） */
  const key = (x: number, y: number) => ({ x, y, width: 24, height: 18 });

  it('钥匙落在门上（底边贴着门顶）就算碰到', () => {
    expect(touchedDoor(doors, 1, key(36, 2 * T - 18), T, TOUCH, all)).toEqual({ x: 1, y: 2, group: 1 });
  });

  it('离门还差几像素以上不算', () => {
    expect(touchedDoor(doors, 1, key(36, 2 * T - 18 - TOUCH - 1), T, TOUCH, all)).toBeNull();
  });

  it('从侧面贴上去也算', () => {
    const side = doorsOf(['.1']);
    expect(touchedDoor(side, 1, key(T - 24, 7), T, TOUCH, all)).toEqual({ x: 1, y: 0, group: 1 });
  });

  it('颜色不对的门不开', () => {
    expect(touchedDoor(doors, 2, key(36, 2 * T - 18), T, TOUCH, all)).toBeNull();
  });

  it('已经开过的门不算', () => {
    expect(touchedDoor(doors, 1, key(36, 2 * T - 18), T, TOUCH, () => false)).toBeNull();
  });

  it('同时碰到好几扇：从离钥匙中心最近的那扇开始', () => {
    // 钥匙骑在第 0、1 列的交界上，偏右：离第 1 列更近
    expect(touchedDoor(doors, 1, key(24, 2 * T - 18), T, TOUCH, all)).toEqual({ x: 1, y: 2, group: 1 });
  });
});
