// ===== 桌面版的 preload：给网页挂一个很小的口子 window.gameDesktop（类型在 src/platform/storage.ts 的 DesktopBridge）=====
// 网页本身不能碰 Node（contextIsolation + sandbox），要存档、退出都经这里让主进程做。
// 读写都用同步消息：存档只有几 KB，关窗口前最后一次写也一定写完。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameDesktop', {
  save: {
    read: name => ipcRenderer.sendSync('save:read', name),
    write: (name, text) => {
      const result = ipcRenderer.sendSync('save:write', name, text);
      if (result !== true) throw new Error(String(result));
    },
  },
  quit: () => ipcRenderer.send('app:quit'),
});
