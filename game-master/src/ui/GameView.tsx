import { useCallback, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import type { StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { useTouch } from './useTouch';
import { TitleScreen } from './TitleScreen';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';

/** 游戏页：标题页，开始后从头玩 */
export function GameView() {
  // 线上版本永远玩打包进去的地图；本地开发玩编辑器里的当前地图
  const editorProject = useAppSelector(s => s.editor.project);
  const project = import.meta.env.PROD ? DEFAULT_PROJECT : editorProject;
  const [data, setData] = useState<StartGameData | null>(null);
  const touch = useTouch();
  const controls = useAppSelector(s => s.hud.controls);

  const start = useCallback(() => setData({ project, playtest: false }), [project]);

  return (
    <div className="view">
      <div className="stage">
        {data
          ? <><PhaserCanvas mode="game" data={data} size={roomPx(project.floors[0].model)} /><Hud />{touch && <TouchControls layout={controls} />}</>
          : <TitleScreen onStart={start} touch={touch} />}
      </div>
    </div>
  );
}
