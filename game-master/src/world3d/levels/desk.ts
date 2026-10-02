// 第一关「桌面」：屏幕立在一块大地板上，前面散着几只箱子，右边一串台阶通到高处
import type { Level3D } from '../level';

const v = (x: number, y: number, z: number) => ({ x, y, z });

export const DESK: Level3D = {
  id: 'desk',
  blocks: [
    { at: v(0, -1, 14), size: v(64, 1, 44) },      // 地板（屏幕后面也有一段）
    { at: v(-7, 0, 9), size: v(3, 1, 3) },
    { at: v(-10, 0, 14), size: v(3, 2, 3) },
    { at: v(-5, 0, 18), size: v(2, 1, 2) },
    { at: v(6, 0, 8), size: v(3, 1, 3) },          // 右边的台阶：一级比一级高
    { at: v(10, 0, 9), size: v(3, 2, 3) },
    { at: v(14, 0, 11), size: v(3, 3, 3) },
    { at: v(18, 0, 14), size: v(4, 4, 4) },
    { at: v(18, 5.5, 21), size: v(4, 0.5, 4) },    // 悬空的板子
    { at: v(12, 6.5, 26), size: v(4, 0.5, 4) },
  ],
  respawn: v(0, 2, 8),
  killY: -24,
  grid: { block: 0, cell: 2 },
};
