import { useState } from 'react';
import { GameView } from './GameView';
import { EditorView } from './EditorView';
import { DevFps } from './DevFps';
import { isTouchDevice } from '@/game/input';
import './app.css';

type Tab = 'game' | 'editor';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const mobile = isTouchDevice();
  // 手机：没有导航和编辑器，只有游戏；竖屏时提示横过来
  if (mobile) {
    return (
      <div className="app mobile">
        <GameView />
        <div className="rotate-hint">横屏玩</div>
      </div>
    );
  }
  return (
    <div className="app">
      <nav className="tabs">
        <span className="brand">Climb</span>
        <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}>游戏</button>
        <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>地图编辑器</button>
      </nav>
      {tab === 'game' ? <GameView /> : <EditorView />}
      <DevFps />
    </div>
  );
}
