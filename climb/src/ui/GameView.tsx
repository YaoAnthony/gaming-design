import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { clearSave } from '@/redux/slices/saveSlice';
import type { StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { useTouch } from './useTouch';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';

/** 游戏页：一个「开始游戏」，从头开始 */
export function GameView() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  // 线上版本永远玩打包进去的地图；本地开发玩编辑器里的当前地图
  const editorProject = useAppSelector(s => s.editor.project);
  const project = import.meta.env.PROD ? DEFAULT_PROJECT : editorProject;
  const [data, setData] = useState<StartGameData | null>(null);
  const touch = useTouch();
  const topdown = useAppSelector(s => s.hud.topdown);

  const start = () => { dispatch(clearSave()); setData({ project, playtest: false }); };

  return (
    <div className="view">
      <div className="stage">
        {data
          ? <><PhaserCanvas mode="game" data={data} size={roomPx(project.floors[0].model)} /><Hud />{touch && <TouchControls topdown={topdown} />}</>
          : <button className="btn primary start" onClick={start}>{t('start')}</button>}
      </div>
    </div>
  );
}
