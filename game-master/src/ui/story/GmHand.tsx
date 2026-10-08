// ===== Game Master 的木手（界面一侧的入口）：把状态登记到 handStore，由 StoryLayer 里的 GmHandLayer 用 3D 模型画出来 =====
// 接口：at = 对准的那一点（舞台像素），anchor = 拿手的哪一点去对（tip 指尖、pinch 捏合点、palm 手心），from = 从哪边伸进来，
// ms = 挪过去用多久，tilt = 再转几度，tremble = 发抖。开场、菜单、演出都这么用，不用管手是怎么画的。
// 3D 画布建不起来（没有 WebGL）时退回 gm_hand.png 的精灵（GmHandSprite）。
import { useEffect, useRef } from 'react';
import { GmHandSprite } from './GmHandSprite';
import { newHandId, publishHand, useHand3dSupported } from './handStore';
import type { HandState } from './handState';

export type { HandFrom, HandState } from './handState';

export function GmHand({ hand, stageH }: { hand: HandState | null; stageH: number }) {
  const id = useRef(0);
  if (!id.current) id.current = newHandId();
  const supported = useHand3dSupported();
  useEffect(() => { publishHand(id.current, hand); }, [hand]);
  useEffect(() => () => publishHand(id.current, null), []);
  return supported === false ? <GmHandSprite hand={hand} stageH={stageH} /> : null;
}
