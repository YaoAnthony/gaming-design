import { describe, expect, it } from 'vitest';
import { pressedByWeight, type PlateWeights } from '@/game/mechanics/pushBlock/plates';

const at = (cells: string[]) => (x: number, y: number) => cells.includes(`${x},${y}`);
const weights = (mover: string[], solid: string[], rubbleCounts = false): PlateWeights => ({ weighs: at(mover), solid: at(solid), rubbleCounts });

describe('压板被什么压着（箱子以外）', () => {
  const plate1 = [{ x: 2, y: 5 }];
  const plate2 = [{ x: 2, y: 5 }, { x: 3, y: 5 }];

  it('移动方块停在压板那一格就算压下', () => {
    expect(pressedByWeight(plate1, weights(['2,5'], ['2,5']))).toBe(true);
    expect(pressedByWeight(plate1, weights([], []))).toBe(false);
  });

  it('两格宽的压板要两格都压着', () => {
    expect(pressedByWeight(plate2, weights(['2,5'], ['2,5']))).toBe(false);
    expect(pressedByWeight(plate2, weights(['2,5', '3,5'], ['2,5', '3,5']))).toBe(true);
  });

  it('掉下来的碎石：开关关着不算，打开才算', () => {
    expect(pressedByWeight(plate1, weights([], ['2,5'], false))).toBe(false);
    expect(pressedByWeight(plate1, weights([], ['2,5'], true))).toBe(true);
  });
});
