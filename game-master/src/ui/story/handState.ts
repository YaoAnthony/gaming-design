// ===== 骷髅手 / 木手在界面上的状态：OpeningMenu、开场、演出都用这一套描述手要去哪、什么样 =====
import type { HandPose } from '@/protocol';
import type { HandFrom } from '@/stage3d/hand/placement';
import type { Pt } from './geometry';

export type { HandFrom };

export interface HandState {
  /** 对准的那一点（舞台像素） */
  at: Pt;
  pose: HandPose;
  /** 拿手的哪一点去对：tip 指尖、pinch 捏合点、palm 手心；不写就按姿势挑（指着 → 指尖，捏着 → 捏合点，其它 → 手心） */
  anchor?: 'tip' | 'pinch' | 'palm';
  /** 手臂从哪边伸进来（默认左边） */
  from?: HandFrom;
  /** 这一次挪过去用多久（毫秒）；0 = 一下子到 */
  ms?: number;
  /** 再多转几度（甩、扫） */
  tilt?: number;
  /** 发抖 */
  tremble?: boolean;
  hidden?: boolean;
  /** 手多长（舞台像素）；不写就按 config.gmHand.length 占舞台高 */
  length?: number;
  /** 手里拎着的东西（主角）：和手画在一起，在手前面 */
  held?: HeldSpriteState | null;
}

/** 被拎着的一张贴图：图的地址、这一帧在图里的像素范围、画在舞台上的中心和大小（像素）、左右翻 */
export interface HeldSpriteState { url: string; frame: { x: number; y: number; w: number; h: number }; at: Pt; w: number; h: number; flipX: boolean }

export const handAnchor = (h: HandState): 'tip' | 'pinch' | 'palm' => h.anchor ?? (h.pose === 'point' ? 'tip' : h.pose === 'pinch' ? 'pinch' : 'palm');
