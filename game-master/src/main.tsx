import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from '@/redux/store';
import { App } from '@/ui/App';
import { getGame } from '@/game/PhaserGame';
import { watchInputDevice } from '@/game/inputDevice';
import '@/i18n';

// 开发期调试入口：控制台可以直接看 store / Phaser 实例；bot = 程序控制的玩家（自动试玩，见 dev/bot.ts）
if (import.meta.env.DEV) {
  const hook: Record<string, unknown> = { store, getGame };
  (window as unknown as { __climb: unknown }).__climb = hook;
  void import('@/dev/bot').then(m => { hook.bot = m.bot; });
}

watchInputDevice();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
