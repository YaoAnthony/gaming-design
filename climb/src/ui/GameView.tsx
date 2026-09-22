import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { clearSave } from '@/redux/slices/saveSlice';
import type { StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { useTouch } from './useTouch';
import { DEFAULT_WORLD } from '@/game/world/defaultWorld';

/** 游戏页：一个「开始游戏」，从头开始 */
export function GameView() {
  const dispatch = useAppDispatch();
  // 线上版本永远玩打包进去的地图；本地开发玩编辑器里的当前地图
  const editorModel = useAppSelector(s => s.editor.model);
  const model = import.meta.env.PROD ? DEFAULT_WORLD : editorModel;
  const [data, setData] = useState<StartGameData | null>(null);
  const touch = useTouch();

  const start = () => { dispatch(clearSave()); setData({ model, playtest: false }); };

  return (
    <div className="view">
      <div className="stage">
        {data
          ? <><PhaserCanvas mode="game" data={data} /><Hud />{touch && <TouchControls />}</>
          : <button className="btn primary start" onClick={start}>开始游戏</button>}
      </div>
    </div>
  );
}
