// ===== 第二幕开头：骷髅手在关卡编辑器里改造 GM 所在的房间 =====
// 每一笔 = 先在物品栏点一种砖，再一格格画上去。坐标是房间里的格子（GM 所在的那个房间 P，左上角 0,0；画在下面那一大片空地上）。
// 已经在编辑器里了（读档回来）：这些格子直接画好，不再演一遍。格子上有东西（人站着、已经有砖）就跳过。
export interface MontageStroke { tile: string; cells: [number, number][] }

const row = (y: number, x0: number, x1: number): [number, number][] => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

export const MONTAGE: MontageStroke[] = [
  { tile: 'R', cells: [...row(15, 2, 7)] },                                         // 左边一块新平台
  { tile: 'S', cells: [[25, 18], [26, 17], [26, 18], [27, 16], [27, 17], [27, 18], [28, 15], [28, 16], [28, 17], [28, 18]] },   // 右边一道台阶
  { tile: '_', cells: [...row(12, 9, 14)] },                                        // 半空中的木板
  { tile: 'R', cells: [...row(10, 21, 26)] },                                       // 右上的平台
  { tile: 'B', cells: [[22, 9], [23, 9], [22, 8], [23, 8]] },                       // 平台上一块脆岩
];
