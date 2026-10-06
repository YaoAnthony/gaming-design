// ===== 矩形相交（不建对象）：和 Phaser.Geom.Intersects.RectangleToRectangle 一样的判定（边贴着也算碰到，宽高 ≤ 0 不算）=====
// 碎块的每一格对每个怪物、对玩家每帧都要查一次：每次 new 一个 Rectangle 会制造大量垃圾，用这个代替。

export interface RectLike { x: number; y: number; width: number; height: number }

/** 矩形 (x, y, w, h) 和 r 有没有相交 */
export function overlaps(x: number, y: number, w: number, h: number, r: RectLike): boolean {
  if (w <= 0 || h <= 0 || r.width <= 0 || r.height <= 0) return false;
  return !(x + w < r.x || y + h < r.y || x > r.x + r.width || y > r.y + r.height);
}
