// ===== 木手在画面上怎么摆（纯计算，有测试）：从哪边伸进来 → 转角和镜像；前臂要伸多长才出画面；挪动的缓动 =====
// 页面坐标：x 朝右、y 朝下，角度顺时针为正（和 CSS 的 rotate 一样）。静止的手：手臂在左、指尖朝右（+x）。

export type HandFrom = 'left' | 'right' | 'top' | 'bottom';
export interface Pt { x: number; y: number }
export interface Orientation { angle: number; mirror: boolean }

/** 手从哪边伸进来：整只手转多少度、要不要左右镜像（先镜像再转）；tilt 再多转几度（甩、扫） */
export function handOrientation(from: HandFrom, tilt = 0): Orientation {
  switch (from) {
    case 'right': return { angle: tilt, mirror: true };
    case 'top': return { angle: 90 + tilt, mirror: false };
    case 'bottom': return { angle: -90 + tilt, mirror: false };
    default: return { angle: tilt, mirror: false };
  }
}

/** 手本地的一个方向 / 位移（x 朝指尖）换到页面坐标：先镜像再转 */
export function toPage(v: Pt, o: Orientation): Pt {
  const x = o.mirror ? -v.x : v.x, a = o.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - v.y * s, y: x * s + v.y * c };
}

/** 前臂从 from 沿 dir（单位向量）伸出去，要多长才出画面（stage 大小）、再多 margin；起点已经在画面外就只有 margin */
export function armReach(from: Pt, dir: Pt, stage: { w: number; h: number }, margin: number): number {
  const exit = (p: number, d: number, size: number) => (d > 1e-9 ? (size - p) / d : d < -1e-9 ? -p / d : Infinity);
  const t = Math.min(exit(from.x, dir.x, stage.w), exit(from.y, dir.y, stage.h));
  return Math.max(0, Number.isFinite(t) ? t : 0) + margin;
}

/** CSS 的 cubic-bezier(x1, y1, x2, y2)：时间 0..1 → 进度 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, k: number) => ((1 - k) ** 3 * 0 + 3 * (1 - k) ** 2 * k * a + 3 * (1 - k) * k * k * b + k ** 3);
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let k = t;   // 按 x 反解参数：牛顿法几步就够
    for (let i = 0; i < 6; i++) {
      const x = at(x1, x2, k) - t;
      const dx = 3 * (1 - k) ** 2 * x1 + 6 * (1 - k) * k * (x2 - x1) + 3 * k * k * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      k = Math.min(1, Math.max(0, k - x / dx));
    }
    return at(y1, y2, k);
  };
}

/** 手挪过去的缓动：和以前 CSS 精灵的 transition 一样 */
export const easeMove = cubicBezier(0.3, 0.7, 0.3, 1);

/** 两个角度之间走最短的路 */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * k;
}
