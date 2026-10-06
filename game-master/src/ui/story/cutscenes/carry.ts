// 演出里被骷髅手拎着走的人（主角、GM 的化身）：一张图，按中心点和宽高放在舞台上
import type { CSSProperties } from 'react';
import { IMAGES } from '@/asset';

export interface Carried { x: number; y: number; w: number; h: number; ms: number; url: string; hidden?: boolean }

export const imageUrl = (key: string): string => IMAGES.find(i => i.key === key)?.url ?? '';

export function carriedStyle(c: Carried): CSSProperties {
  return {
    width: c.w, height: c.h,
    transform: `translate(${c.x - c.w / 2}px, ${c.y - c.h / 2}px)`,
    transition: c.ms ? `transform ${c.ms}ms cubic-bezier(.3, .7, .3, 1), width ${c.ms}ms, height ${c.ms}ms` : 'none',
    backgroundImage: `url(${c.url})`,
    opacity: c.hidden ? 0 : 1,
  };
}
