import { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { getGame } from '@/game/PhaserGame';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { Palette } from './editor/Palette';
import { RoomMap } from './editor/RoomMap';
import { Toolbar } from './editor/Toolbar';

/** 编辑器页：左侧物品栏 / 房间 / 操作，右侧画布；试玩在同一个 Phaser 实例里切场景 */
export function EditorView() {
  const { model, room } = useAppSelector(s => s.editor);
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
    const data: StartGameData = { model, startRoom: fromStart ? null : room, playtest: true };
    game.scene.getScene(SCENE.editor).scene.start(SCENE.game, data);
    setPlaying(true);
  };

  return (
    <div className="editor">
      <aside className="side">
        <h1>地图编辑器</h1>
        <div className="hint">左键画、右键擦、按住拖动连续画。红框 = 一开始就会掉落的地块（没连到岩石）。</div>
        <Palette />
        <RoomMap />
        <Toolbar onPlay={play} status={status} />
      </aside>
      <main className="stage">
        <PhaserCanvas mode="editor" />
        {playing && <Hud />}
      </main>
    </div>
  );
}
