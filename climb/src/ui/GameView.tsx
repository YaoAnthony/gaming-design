import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { clearSave } from '@/redux/slices/saveSlice';
import type { StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { isTouchDevice } from '@/game/input';

/** 游戏页：一个「开始游戏」，从头开始 */
export function GameView() {
  const dispatch = useAppDispatch();
  const model = useAppSelector(s => s.editor.model);
  const [data, setData] = useState<StartGameData | null>(null);

  const start = () => { dispatch(clearSave()); setData({ model, playtest: false }); };

  return (
    <div className="view">
      <div className="stage">
        {data
          ? <><PhaserCanvas mode="game" data={data} /><Hud />{isTouchDevice() && <TouchControls />}</>
          : <button className="btn primary start" onClick={start}>开始游戏</button>}
      </div>
    </div>
  );
}
