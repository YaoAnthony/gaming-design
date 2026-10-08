import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import signUrl from '@/asset/image/ui/game-master-sign.png';
import { TitleSignView } from '@/stage3d/title/TitleSignView';
import { elementBox } from './geometry';
import { sfx, shakeStage } from './sfx';

export interface OpeningTitleHandle {
  enter(): Promise<void>;
  drop(): Promise<void>;
}

/** The DOM owns layout and the heading; Three.js draws the sprite and its rigid straps. */
export function OpeningTitle({ stage, control }: {
  stage: HTMLElement;
  control: MutableRefObject<OpeningTitleHandle | null>;
}) {
  const title = useRef<HTMLHeadingElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const [shown, setShown] = useState(false);
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    const el = title.current, surface = canvas.current;
    if (!el || !surface) return;
    let disposed = false;
    let view: TitleSignView | null = null;
    try {
      view = new TitleSignView(surface, signUrl, () => ({
        w: stage.clientWidth, h: stage.clientHeight, title: elementBox(stage, el),
      }), () => { if (!disposed) { sfx('slam', 0.7); shakeStage(stage); } });
    } catch (error) {
      console.warn('Title WebGL unavailable; using the transparent sprite.', error);
      setFallback(true);
    }
    const resize = new ResizeObserver(() => view?.layout());
    resize.observe(stage);
    if (el.parentElement) resize.observe(el.parentElement);
    control.current = {
      async enter() {
        if (view) {
          try { await view.enter(); }
          catch (error) {
            if (disposed) return;
            console.warn('Title texture unavailable; using the image fallback.', error);
            view.dispose(); view = null;
            setFallback(true); setShown(true);
          }
        } else setShown(true);
        if (!disposed && !view) { sfx('slam', 0.7); shakeStage(stage); }
      },
      async drop() {
        sfx('whoosh');
        if (view) await view.drop();
        else setDropped(true);
      },
    };
    return () => { disposed = true; control.current = null; resize.disconnect(); view?.dispose(); };
  }, [stage, control]);

  return <>
    <h1 ref={title} aria-label="GAME MASTER" className={'op-title op-title-sign' + (fallback && shown ? ' fallback' : '') + (dropped ? ' dropped' : '')}>
      <img src={signUrl} alt="GAME MASTER" />
    </h1>
    <canvas ref={canvas} hidden={fallback} className="op-title-canvas" aria-hidden="true" />
  </>;
}
