// 编辑器入口：antd 的主题 / 中文 / 弹窗上下文只有编辑器用，放在这里，随编辑器一起按需加载（线上版本没有编辑器，不下载 antd）
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { EditorView } from '../EditorView';

export default function EditorRoot() {
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#4cc9f0', colorBgBase: '#0b0b14', borderRadius: 6 } }}>
      <AntApp component={false}>
        <EditorView />
      </AntApp>
    </ConfigProvider>
  );
}
