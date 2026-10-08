// ===== 画木手的透明画布：挂在 StoryLayer 里，盖在标题、菜单、演出上面（和以前 .gm-hand 的层级一样）=====
// 画布的一个像素 = 游戏画布在页面上的一个像素（× config.gmHand.pixel），和游戏画面一样的像素风。
// 建不起来（没有 WebGL）就告诉 GmHand 退回 PNG 精灵。
import { useEffect, useRef } from 'react';
import { GM_HAND_PALETTE } from '@/shared/palette';
import { MODELS } from '@/asset';
import { getGame } from '@/game/PhaserGame';
import { store } from '@/redux/store';
import { HandView, type HandViewState } from '@/stage3d/hand/HandView';
import { currentHand, setHand3dSupported, subscribeHand } from './handStore';
import { handAnchor, type HandState } from './handState';

const toView = (h: HandState | null): HandViewState | null => h && {
  at: h.at, anchor: handAnchor(h), pose: h.pose, from: h.from ?? 'left', ms: h.ms ?? 0, tilt: h.tilt ?? 0, tremble: !!h.tremble, hidden: !!h.hidden,
  length: h.length ?? null, held: h.held ?? null,
};

export function GmHandLayer() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!, host = canvas.parentElement!;
    let view: HandView;
    try {
      view = new HandView(canvas, {
        modelUrl: MODELS.gmHand, palette: GM_HAND_PALETTE,
        config: () => store.getState().config.gmHand,
        measure: () => {
          const game = getGame(), rect = game?.canvas.getBoundingClientRect();
          const pixel = game && rect && rect.width > 0 ? rect.width / game.canvas.width : 1;
          return { w: host.clientWidth, h: host.clientHeight, pixel };
        },
      });
    } catch (e) {
      console.warn('木手的 3D 画布建不起来，退回 PNG 精灵', e);
      setHand3dSupported(false);
      return;
    }
    setHand3dSupported(true);
    if (import.meta.env.DEV) window.__gmHand = view;   // 控制台调试：看手现在的状态
    view.set(toView(currentHand()));
    const unsubscribe = subscribeHand(() => view.set(toView(currentHand())));
    const observer = new ResizeObserver(() => view.layout());
    observer.observe(host);
    const gameCanvas = getGame()?.canvas;
    if (gameCanvas) observer.observe(gameCanvas);
    return () => { unsubscribe(); observer.disconnect(); view.dispose(); };
  }, []);

  return <canvas ref={ref} className="gm-hand3d" aria-hidden="true" />;
}
