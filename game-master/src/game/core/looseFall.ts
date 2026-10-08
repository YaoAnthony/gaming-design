// ===== 地上物件（钥匙、蜡烛、帽子、胶带）的掉落：参数和纯计算（物理体、贴图在 LooseItems.ts） =====

/** 默认的碰撞框（像素，钥匙用这个）：比一格窄，一格宽的洞也掉得下去；底边就是东西停着时贴图的底边 */
export const LOOSE_BODY = { w: 24, h: 18 };
/** 落地：下落速度（像素/秒）≥ minVy 才弹起来、才压扁和溅火花；弹起的速度 = 落地的速度 × bounce */
export const LOOSE_LANDING = { minVy: 160, bounce: 0.35, sparks: 6 };
/** 横向减速（像素/秒²）：被推着走、推完多快停下；从平台边上推下去基本是直直落下 */
export const LOOSE_DRAG = 700;
/** 停着时上下浮：幅度（像素）、周期（毫秒）；不浮的东西（帽子）在 LooseView 里关掉 */
export const LOOSE_BOB = { amp: 3, periodMs: 1800 };
/** 落地压扁：最扁时高度少几成、多久弹回（毫秒） */
export const LOOSE_SQUASH = { amount: 0.3, ms: 220 };
/** 在空中歪多少：每 1 像素/秒的下落速度歪多少度，最多歪多少度 */
export const LOOSE_TILT = { perVy: 0.03, max: 18 };

/** 落地后往上弹的速度（负数 = 往上）；落得太慢不弹，返回 0 */
export function landingBounce(impactVy: number): number {
  return impactVy >= LOOSE_LANDING.minVy ? -impactVy * LOOSE_LANDING.bounce : 0;
}

/** 停着时浮起多少像素（往上是负）：0 到 -amp 之间按时间走一个正弦；rest = 停稳的程度 0..1，没停稳不浮 */
export function bobOffset(timeMs: number, rest: number): number {
  return -LOOSE_BOB.amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * timeMs) / LOOSE_BOB.periodMs)) * rest;
}

/** 在空中歪的角度（度）：往下掉得越快歪得越多；在地上摆正 */
export function fallTilt(vy: number, onGround: boolean): number {
  return onGround ? 0 : Math.max(-LOOSE_TILT.max, Math.min(LOOSE_TILT.max, vy * LOOSE_TILT.perVy));
}

/** 落地压扁：落地后 elapsedMs 毫秒时高度的比例（1 = 不扁），在 LOOSE_SQUASH.ms 里弹回 1 */
export function squashY(elapsedMs: number): number {
  if (!(elapsedMs >= 0) || elapsedMs >= LOOSE_SQUASH.ms) return 1;
  const k = elapsedMs / LOOSE_SQUASH.ms;
  return 1 - LOOSE_SQUASH.amount * (1 - k) * (1 - k);
}

/** 被埋在砖里：从 (x, y) 这一格往上找第一格空的，找到 minY 为止；都是实心返回 null */
export function freeCellAbove(solid: (x: number, y: number) => boolean, x: number, y: number, minY = 0): number | null {
  for (let cy = y; cy >= minY; cy--) if (!solid(x, cy)) return cy;
  return null;
}

/**
 * 被移动方块（或者怪物）顶进了单向木板那一格：木板只能从上面站，钥匙从下面穿进来本来会再掉回去；
 * 身体和板重叠过半就算「穿过去了」，返回那块板的顶边 y（像素），钥匙该落在板上；没穿进板里返回 null。
 * 几块板重叠时取最上面那块。(left, right, top, bottom) 是钥匙的碰撞框，T 一格多大，isOneWay(cx, cy) 这一格是不是单向板
 */
export function liftOntoPlank(left: number, right: number, top: number, bottom: number, T: number, isOneWay: (cx: number, cy: number) => boolean): number | null {
  const h = bottom - top;
  if (h <= 0) return null;
  const cx0 = Math.floor((left + 1) / T), cx1 = Math.floor((right - 1) / T);
  for (let cy = Math.floor(top / T); cy <= Math.floor((bottom - 1) / T); cy++) {
    const overlap = Math.min(bottom, (cy + 1) * T) - Math.max(top, cy * T);
    if (overlap < h / 2) continue;
    for (let cx = cx0; cx <= cx1; cx++) if (isOneWay(cx, cy)) return cy * T;
  }
  return null;
}

export { pushOutX } from './solid';   // 被带进墙里推回墙外：移动方块、纸上的人和箱子也用，所以放在 core
