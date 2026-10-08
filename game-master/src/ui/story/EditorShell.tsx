// ===== 第二幕：游戏画面外面套着一个关卡编辑器（GM 把主角拖了进来，自己在里面改造游戏）=====
// 游戏画面缩小、挪到编辑器的画布位置（.stage.in-editor，CSS 过渡 EDITOR_SHELL_MS），四周围上编辑器的界面：
// 上面菜单栏，左边砖块（GM 改造时点的就是这些：data-story-tile），右边物件（GM 的化身被拖进来之后在 data-story-slot="gm" 那一格），下面状态栏。
// 只是个样子，玩家点不了（游戏照常玩）。
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { SPRITESHEETS, TILE_ATLAS_FRAMES, TILE_FRAMES, IMAGES } from '@/asset';
import { canvasBox, type Box } from './geometry';

/** 编辑器套上来要多久（毫秒）：和 app.css 的 .stage.in-editor 过渡一致 */
export const EDITOR_SHELL_MS = 700;

/** 左边物品栏的砖块：字符 → 图集里第几帧 */
const TILES: [string, number][] = [['R', TILE_FRAMES.rock], ['r', TILE_FRAMES.crackedRock], ['B', TILE_FRAMES.brittle], ['S', TILE_FRAMES.sand], ['_', TILE_FRAMES.plank], ['=', TILE_FRAMES.letter], ['X', TILE_FRAMES.spikes]];
const OBJECTS = ['player', 'door', 'key', 'candle', 'hat'];
const img = (key: string) => IMAGES.find(i => i.key === key)?.url ?? '';

export function EditorShell({ stage }: { stage: HTMLElement | null }) {
  const { t } = useTranslation();
  const shell = useAppSelector(s => s.hud.editorShell);
  const place = useAppSelector(s => s.hud.place);
  const [box, setBox] = useState<Box | null>(null);
  const raf = useRef(0);

  // 舞台加上 in-editor：游戏画面缩进编辑器的画布
  useEffect(() => {
    const el = stage?.closest('.stage');
    if (!el || !shell.on) return;
    el.classList.add('in-editor');
    return () => el.classList.remove('in-editor');
  }, [stage, shell.on]);

  // 跟着画布摆四周的面板：套上来的过程中每帧量，之后跟着窗口变
  useEffect(() => {
    if (!stage || !shell.on) { setBox(null); return; }
    const measure = () => setBox(canvasBox(stage));
    const until = performance.now() + EDITOR_SHELL_MS + 100;
    const tick = () => { measure(); if (performance.now() < until) raf.current = requestAnimationFrame(tick); };
    tick();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
  }, [stage, shell.on]);

  if (!shell.on || !box) return null;
  const pal = Math.max(44, box.w * 0.13), top = Math.max(22, box.h * 0.07), bottom = Math.max(18, box.h * 0.05);
  const x0 = box.x - pal, w = box.w + pal * 2;
  const tile = Math.min(pal * 0.42, 40);
  const sheet = SPRITESHEETS[0];
  return (
    <div className="editor-shell" aria-hidden="true">
      <div className="es-top" style={{ left: x0, top: box.y - top, width: w, height: top }}>
        <b>{t('story.editor.title')}</b>
        {(t('story.editor.menu', { returnObjects: true }) as string[]).map(m => <span key={m}>{m}</span>)}
      </div>
      <div className="es-side es-left" style={{ left: x0, top: box.y, width: pal, height: box.h }}>
        <div className="es-head">{t('story.editor.tiles')}</div>
        <div className="es-grid">
          {TILES.map(([ch, frame]) => (
            <span key={ch} data-story-tile={ch} className="es-tile" style={{ width: tile, height: tile, backgroundImage: `url(${sheet.url})`, backgroundSize: `${tile * TILE_ATLAS_FRAMES}px ${tile}px`, backgroundPosition: `${-frame * tile}px 0` }} />
          ))}
        </div>
      </div>
      <div className="es-side es-right" style={{ left: box.x + box.w, top: box.y, width: pal, height: box.h }}>
        <div className="es-head">{t('story.editor.objects')}</div>
        <div className="es-grid">
          {OBJECTS.map(k => <span key={k} className="es-tile es-obj" style={{ width: tile, height: tile, backgroundImage: `url(${img(k)})` }} />)}
          <span data-story-slot="gm" className={'es-tile es-obj es-gm' + (shell.gm ? ' filled' : '')} style={{ width: tile, height: tile, backgroundImage: shell.gm ? `url(${img('skeleton')})` : undefined }} />
        </div>
      </div>
      <div className="es-status" style={{ left: x0, top: box.y + box.h, width: w, height: bottom }}>
        <span>{shell.gm ? t('story.editor.status') : ''}</span>
        <span>{t('story.editor.room')} {place}</span>
      </div>
    </div>
  );
}
