import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { getGame } from '@/game/PhaserGame';
import { bridge, EVT } from '@/protocol';
import { PhaserCanvas } from './PhaserCanvas';
import { CrumpleOverlay } from './crumple/CrumpleOverlay';
import { Hud } from './Hud';
import { StageLayer } from './stage/StageLayer';
import { Palette } from './editor/Palette';
import { RoomMap } from './editor/RoomMap';
import { Toolbar } from './editor/Toolbar';
import { FilePanel } from './editor/FilePanel';
import { PlayPanel } from './editor/PlayPanel';
import { FloorTabs } from './editor/FloorTabs';
import { TextPanel } from './editor/TextPanel';
import { currentFloor, redo, undo } from '@/redux/slices/editorSlice';
import { roomPx } from '@/game/PhaserGame';

/** 编辑器页：左边物品栏 / 文字 / 游戏设置，中间画布，右边试玩、房间、文件；试玩在同一个 Phaser 实例里切场景 */
export function EditorView() {
  const floor = useAppSelector(s => currentFloor(s.editor));
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const dispatch = useAppDispatch();

  // 撤销 / 重做：Ctrl(⌘)+Z、Ctrl(⌘)+Shift+Z、Ctrl+Y。试玩中、在输入框里打字时不管
  useEffect(() => {
    if (playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch(undo()); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch(redo()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, dispatch]);

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

  return (
    <div className="editor">
      <aside className="side">
        <h1>地图编辑器</h1>
        <div className="hint">左键画、右键擦、按住拖动连续画。Ctrl(⌘)+Z 撤销，Ctrl(⌘)+Shift+Z 重做。红框 = 一开始就会掉落的地块（没连到岩石）。</div>
        <Palette />
        <TextPanel />
        <Toolbar />
      </aside>
      <main className="stage-col">
        {!playing && <FloorTabs />}
        <div className="stage">
          <PhaserCanvas mode="editor" size={roomPx(floor.model)} />
          {playing && <><StageLayer /><Hud /><CrumpleOverlay /></>}
        </div>
      </main>
      <aside className="side side-right">
        <PlayPanel playing={playing} onStart={() => setPlaying(true)} />
        <RoomMap />
        <FilePanel status={status} />
      </aside>
    </div>
  );
}
