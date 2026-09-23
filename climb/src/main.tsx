import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { store } from '@/redux/store';
import { App } from '@/ui/App';
import { getGame } from '@/game/PhaserGame';
import '@/i18n';

// 开发期调试入口：控制台可以直接看 store / Phaser 实例
if (import.meta.env.DEV) (window as unknown as { __climb: unknown }).__climb = { store, getGame };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider locale={zhCN} theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#4cc9f0', colorBgBase: '#0b0b14', borderRadius: 6 } }}>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </Provider>
  </React.StrictMode>,
);
