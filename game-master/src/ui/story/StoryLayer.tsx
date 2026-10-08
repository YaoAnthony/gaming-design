// 主线剧情界面：标题菜单、剧情演出、第二幕编辑器外壳。
import { useRef } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { GameHandOverlay } from './GameHandOverlay';
import { GmHandLayer } from './GmHandLayer';
import { OpeningMenu } from './OpeningMenu';
import { CutscenePlayer } from './cutscenes';
import { EditorShell } from './EditorShell';
import { useBoxSize } from './useBox';

export function StoryLayer() {
  const root = useRef<HTMLDivElement>(null);
  const { h: stageH } = useBoxSize(root);
  const mode = useAppSelector(s => s.hud.mode);
  const el = root.current;
  return (
    <div ref={root} className="story-layer">
      <EditorShell stage={el} />
      {mode === 'opening' && el && <OpeningMenu stage={el} stageH={stageH} />}
      <CutscenePlayer stage={el} stageH={stageH} />
      <GameHandOverlay stage={el} stageH={stageH} />
      <GmHandLayer />
    </div>
  );
}
