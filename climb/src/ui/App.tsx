import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameView } from './GameView';
import { DevFps } from './DevFps';
import { useTouch } from './useTouch';
import './app.css';

/** 编辑器（连同 antd）按需加载：只有本地开发的电脑端会打开它 */
const EditorRoot = lazy(() => import('./editor/EditorRoot'));

type Tab = 'game' | 'editor';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const mobile = useTouch();
  const { t } = useTranslation();
  // 线上版本和手机：没有导航和编辑器，只有游戏；手机竖屏时提示横过来
  if (mobile || import.meta.env.PROD) {
    return (
      <div className={'app' + (mobile ? ' mobile' : ' play-only')}>
        <GameView />
        {mobile && <div className="rotate-hint">{t('rotate')}</div>}
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
      {tab === 'game' ? <GameView /> : <Suspense fallback={null}><EditorRoot /></Suspense>}
      <DevFps />
    </div>
  );
}
