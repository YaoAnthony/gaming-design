// ===== 游戏一侧要画的手（复活时捏着主角进场……）：听 EVT.gameHand，把画面比例坐标换成舞台像素，登记给 handStore 画 =====
// 游戏那边每帧发位置（ms = 0），手跟着走；spot 为 null 就收走。每帧一次，直接登记、不经过 React 的状态。
// 手里拎着的主角（held）也一起交过去，贴图按 key 从资源清单里找。没有 WebGL 时退回 PNG 精灵（GmHandSprite）。
import { useEffect, useRef, useState } from 'react';
import { ASEPRITES, IMAGES } from '@/asset';
import { bridge, EVT, type GameHand, type HeldSprite } from '@/protocol';
import { GmHandSprite } from './GmHandSprite';
import { canvasBox, spotPx } from './geometry';
import { newHandId, publishHand, useHand3dSupported } from './handStore';
import type { HandState, HeldSpriteState } from './handState';

const textureUrl = (key: string): string => ASEPRITES.find(a => a.key === key)?.url ?? IMAGES.find(i => i.key === key)?.url ?? '';

function heldPx(stage: HTMLElement, h: HeldSprite): HeldSpriteState {
  const b = canvasBox(stage);
  return { url: textureUrl(h.texture), frame: h.frame, at: spotPx(stage, h.at), w: h.w * b.w, h: h.h * b.h, flipX: h.flipX };
}

export function GameHandOverlay({ stage, stageH }: { stage: HTMLElement | null; stageH: number }) {
  const id = useRef(0);
  if (!id.current) id.current = newHandId();
  const supported = useHand3dSupported();
  const sprite = useRef(supported === false);
  sprite.current = supported === false;
  const [fallback, setFallback] = useState<HandState | null>(null);

  useEffect(() => {
    const on = (h: GameHand) => {
      const state: HandState | null = h.spot && stage
        ? {
          at: spotPx(stage, h.spot), pose: h.pose, anchor: h.anchor, from: h.from ?? 'bottom', tilt: h.tilt, ms: h.ms,
          length: h.length ? h.length * canvasBox(stage).h : undefined, held: h.held ? heldPx(stage, h.held) : null,
        }
        : null;
      publishHand(id.current, state);
      if (sprite.current) setFallback(state);
    };
    bridge.on(EVT.gameHand, on);
    return () => { bridge.off(EVT.gameHand, on); publishHand(id.current, null); };
  }, [stage]);

  return supported === false ? <GmHandSprite hand={fallback} stageH={stageH} /> : null;
}
