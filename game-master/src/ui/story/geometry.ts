// ===== 剧情演出里的坐标：游戏一侧给的是画面比例坐标（ScreenSpot），界面一侧要换成舞台（.stage）里的像素 =====
import type { ScreenSpot } from '@/protocol';
import { getGame } from '@/game/PhaserGame';

export interface Box { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

/** 游戏画布在舞台里的位置和大小（像素，舞台左上角是原点）；没有画布返回整个舞台 */
export function canvasBox(stage: HTMLElement): Box {
  const s = stage.getBoundingClientRect();
  const c = getGame()?.canvas.getBoundingClientRect();
  if (!c || !c.width) return { x: 0, y: 0, w: s.width, h: s.height };
  return { x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height };
}

/** 画面比例坐标 → 舞台像素 */
export function spotPx(stage: HTMLElement, spot: ScreenSpot): Pt {
  const b = canvasBox(stage);
  return { x: b.x + spot.x * b.w, y: b.y + spot.y * b.h };
}

/** 一个元素在舞台里的位置和大小 */
export function elementBox(stage: HTMLElement, el: Element): Box {
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** 等一会（演出的时间线用）；signal 取消时提前结束并抛出，时间线就停在那 */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
