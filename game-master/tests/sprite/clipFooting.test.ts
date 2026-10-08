import { describe, expect, it, vi } from 'vitest';
import { Enemy } from '@/sprite/Enemy';
import type { Terrain } from '@/game/terrain/Terrain';

// J 房复现帧：石地板顶面 608，钥匙顶面 590，夹子踩在钥匙右边缘。
function patrol(bottom: number, footing: (x: number, y: number) => boolean, dir: -1 | 1 = -1, left = 2411, wall = false) {
  const enemy = Object.create(Enemy.prototype) as Enemy;
  Object.assign(enemy, {
    body: { left, right: left + 14, bottom, center: { x: left + 7 }, blocked: { down: true, left: wall, right: false } },
    dir, mode: 'patrol', slipping: 0, biting: false,
    setVelocityX: vi.fn(), setFlipX: vi.fn(),
  });
  enemy.step({ T: 32 } as Terrain, 960, 60, footing);
  return enemy;
}

describe('夹子巡逻的脚下探测', () => {
  it.each([-1, 1] as const)('踩到钥匙抬高 18px 时继续原方向 %i，不把下方石地板当悬崖', dir => {
    const enemy = patrol(590, (_x, y) => y === 19, dir);
    expect(enemy.dir).toBe(dir);
    expect(enemy.setVelocityX).toHaveBeenCalledWith(dir * 60);
  });
  it('在同一高度的石地板上正常巡逻', () => {
    expect(patrol(608, (_x, y) => y === 19).dir).toBe(-1);
  });
  it('真正的悬崖仍掉头，不因为下方一格有地就冲出去', () => {
    const enemy = patrol(608, (x, y) => (x >= 75 && y === 19) || y === 20, -1, 2400);
    expect(enemy.dir).toBe(1);
  });
  it('钥匙悬在坑上时，没有近处落脚点仍掉头', () => {
    expect(patrol(590, (_x, y) => y === 20).dir).toBe(1);
  });
  it('小落差不会覆盖撞墙掉头', () => {
    expect(patrol(590, (_x, y) => y === 19, -1, 2411, true).dir).toBe(1);
  });
});
