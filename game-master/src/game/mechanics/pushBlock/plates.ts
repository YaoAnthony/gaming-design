// ===== 压板被什么压着（纯函数，单测直接调） =====
import type { CellRef } from '@/type';

export interface PlateWeights {
  /** 这一格被别的机制的重物压着（比如移动方块），见 Mechanic.weighs */
  weighs(cx: number, cy: number): boolean;
  /** 这一格现在是实心的地形 */
  solid(cx: number, cy: number): boolean;
  /** 掉下来的碎石（任何实心地形）也算压着：config.platePressedByRubble */
  rubbleCounts: boolean;
}

/** 箱子以外的东西压满了压板的每一格：机制的重物，或者（开关打开时）任何实心地形 */
export function pressedByWeight(cells: CellRef[], w: PlateWeights): boolean {
  return cells.length > 0 && cells.every(c => w.weighs(c.x, c.y) || (w.rubbleCounts && w.solid(c.x, c.y)));
}
