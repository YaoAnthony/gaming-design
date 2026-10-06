// ===== Game Master 的骷髅手（界面一侧）：一张横排的帧条（asset 的 GM_HAND），按姿势换帧，CSS 过渡挪位置 =====
// 手臂默认从左边伸进来、指尖朝右。from 决定从哪边伸进来（贴图跟着翻转 / 旋转）；手的左边平铺一段前臂，一直接到画面外。
// at = 对准的那一点（舞台像素），anchor = 拿手的哪一点去对：tip 指尖、pinch 捏合点、palm 手心。
import type { CSSProperties } from 'react';
import { GM_HAND } from '@/asset';
import type { HandPose } from '@/protocol';
import type { Pt } from './geometry';

export type HandFrom = 'left' | 'right' | 'top' | 'bottom';

export interface HandState {
  at: Pt;
  pose: HandPose;
  anchor?: 'tip' | 'pinch' | 'palm';
  from?: HandFrom;
  /** 这一次挪过去用多久（毫秒）；0 = 一下子到 */
  ms?: number;
  /** 再多转几度（甩、扫） */
  tilt?: number;
  /** 发抖 */
  tremble?: boolean;
  hidden?: boolean;
}

/** 手在舞台上放多大：一帧的高 = 舞台高的这么多 */
const HEIGHT_OF_STAGE = 0.34;
/** 前臂平铺多长（像素，保证伸到画面外） */
const ARM_PX = 4000;
const ROT: Record<HandFrom, number> = { left: 0, right: 180, top: 90, bottom: -90 };

export function GmHand({ hand, stageH }: { hand: HandState | null; stageH: number }) {
  if (!hand) return null;
  const k = (stageH * HEIGHT_OF_STAGE) / GM_HAND.frameH;   // 放大倍数
  const w = GM_HAND.frameW * k, h = GM_HAND.frameH * k;
  const anchor = GM_HAND[hand.anchor ?? (hand.pose === 'point' ? 'tip' : hand.pose === 'pinch' ? 'pinch' : 'palm')];
  const frame = Math.max(0, GM_HAND.frames.indexOf(hand.pose));
  const from = hand.from ?? 'left';
  // 从右边伸进来：上下翻（转 180° 之后手指还是朝上）
  const flipY = from === 'right' ? -1 : 1;
  const style: CSSProperties = {
    width: w, height: h,
    transform: `translate(${hand.at.x}px, ${hand.at.y}px) rotate(${ROT[from] + (hand.tilt ?? 0)}deg) scaleY(${flipY}) translate(${-anchor[0] * w}px, ${-anchor[1] * h}px)`,
    transformOrigin: '0 0',
    transition: hand.ms ? `transform ${hand.ms}ms cubic-bezier(.3, .7, .3, 1)` : 'none',
    opacity: hand.hidden ? 0 : 1,
  };
  return (
    <div className={'gm-hand' + (hand.tremble ? ' tremble' : '')} style={style} aria-hidden="true">
      <div className="gm-hand-arm" style={{ width: ARM_PX, height: h, left: -ARM_PX + 1, backgroundImage: `url(${GM_HAND.armUrl})`, backgroundSize: `${16 * k}px ${h}px` }} />
      <div className="gm-hand-img" style={{ width: w, height: h, backgroundImage: `url(${GM_HAND.url})`, backgroundSize: `${w * GM_HAND.frames.length}px ${h}px`, backgroundPosition: `${-frame * w}px 0` }} />
    </div>
  );
}
