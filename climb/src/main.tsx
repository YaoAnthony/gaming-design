import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from '@/redux/store';
import { App } from '@/ui/App';
import { getGame } from '@/game/PhaserGame';

// 开发期调试入口：控制台可以直接看 store / Phaser 实例
if (import.meta.env.DEV) (window as unknown as { __climb: unknown }).__climb = { store, getGame };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
