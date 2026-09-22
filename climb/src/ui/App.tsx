import { useState } from 'react';
import { GameView } from './GameView';
import { EditorView } from './EditorView';
import './app.css';

type Tab = 'game' | 'editor';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  return (
    <div className="app">
      <nav className="tabs">
        <span className="brand">Climb</span>
        <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}>游戏</button>
        <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>地图编辑器</button>
      </nav>
      {tab === 'game' ? <GameView /> : <EditorView />}
    </div>
  );
}
