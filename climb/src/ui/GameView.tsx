import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { clearSave } from '@/redux/slices/saveSlice';
import type { StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';

/** 游戏页：新游戏 / 继续存档 → Phaser 画布 + HUD */
export function GameView() {
  const dispatch = useAppDispatch();
  const model = useAppSelector(s => s.editor.model);
  const save = useAppSelector(s => s.save.current);
  const [data, setData] = useState<StartGameData | null>(null);

  const saveInfo = useMemo(() => (save ? new Date(save.savedAt).toLocaleString() : null), [save]);

  const newGame = () => { dispatch(clearSave()); setData({ model, playtest: false }); };
  const continueGame = () => { if (!save) return; setData({ model, rows: save.rows, entry: save.entry, startRoom: save.room, stats: save.stats, playtest: false }); };
  const stop = () => setData(null);

  return (
    <div className="view">
      <div className="toolbar">
        <button className="btn primary" onClick={newGame}>新游戏</button>
        <button className="btn" onClick={continueGame} disabled={!save}>继续{saveInfo ? `（${saveInfo}）` : ''}</button>
        {data && <button className="btn" onClick={stop}>停止</button>}
        <span className="hint">进入每个房间时自动存档，存在浏览器里。</span>
      </div>
      <div className="stage">
        {data ? <><PhaserCanvas mode="game" data={data} /><Hud /></> : <div className="placeholder">点「新游戏」开始。地图用的是编辑器里的当前地图。</div>}
      </div>
    </div>
  );
}
