import { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { getGame } from '@/game/PhaserGame';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { Palette } from './editor/Palette';
import { RoomMap } from './editor/RoomMap';
import { Toolbar } from './editor/Toolbar';
import { FilePanel } from './editor/FilePanel';
import { FloorTabs } from './editor/FloorTabs';
import { TextPanel } from './editor/TextPanel';
import { currentFloor } from '@/redux/slices/editorSlice';
import { roomPx } from '@/game/PhaserGame';

/** 编辑器页：左边物品栏 / 文字 / 游戏设置，中间画布，右边试玩、房间、文件；试玩在同一个 Phaser 实例里切场景 */
export function EditorView() {
  const { project, room } = useAppSelector(s => s.editor);
  const floor = useAppSelector(s => currentFloor(s.editor));
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const onExit = () => setPlaying(false);
    bridge.on(EVT.playtestExit, onExit);
    return () => { bridge.off(EVT.playtestExit, onExit); };
  }, []);

  useEffect(() => {
    const game = getGame();
    if (!game) return;
    const onStatus = (s: string) => setStatus(s);
    game.events.on('editor:status', onStatus);
    return () => { game.events.off('editor:status', onStatus); };
  }, [playing]);

  const play = (fromStart: boolean) => {
    const game = getGame();
    if (!game) return;
    const data: StartGameData = { project, floorId: floor.id, startRoom: fromStart ? null : room, playtest: true };
    game.scene.getScene(SCENE.editor).scene.start(SCENE.game, data);
    setPlaying(true);
  };

  return (
    <div className="editor">
      <aside className="side">
        <h1>地图编辑器</h1>
        <div className="hint">左键画、右键擦、按住拖动连续画。红框 = 一开始就会掉落的地块（没连到岩石）。</div>
        <Palette />
        <TextPanel />
        <Toolbar />
      </aside>
      <main className="stage-col">
        {!playing && <FloorTabs />}
        <div className="stage">
          <PhaserCanvas mode="editor" size={roomPx(floor.model)} />
          {playing && <Hud />}
        </div>
      </main>
      <aside className="side side-right">
        <h2>试玩</h2>
        {playing
          ? <>
              <div className="row"><button className="btn primary" onClick={() => bridge.emit(EVT.requestPlaytestExit)}>◀ 返回编辑器</button></div>
              <div className="hint">也可以按 ESC。R 重置房间。</div>
            </>
          : <>
              <div className="row"><button className="btn primary" onClick={() => play(false)}>▶ 从本房间试玩</button></div>
              <div className="row"><button className="btn" onClick={() => play(true)} title="从这一层的出生点开始">▶ 从这层开始</button></div>
              <div className="hint">试玩时 ESC 或上面的按钮回到编辑器，R 重置房间。</div>
            </>}
        <RoomMap />
        <FilePanel status={status} />
      </aside>
    </div>
  );
}
