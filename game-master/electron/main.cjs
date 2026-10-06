// ===== 桌面版（Electron）的主进程 =====
// - 打包好的网页（dist/）用自定义协议 app://game/ 加载：资源路径和网页版一样是绝对路径，不用改 Vite 的 base，也没有 file:// 的跨域问题
// - `npm run desktop:dev`（带 --dev）直接连开发服务器 http://localhost:5174（要先 npm run dev）
// - 存档写在用户数据目录（saveFiles.cjs）；音频不用等玩家先按一下就能放（节奏关卡开场就要出声）
// - F11 切换全屏；不让网页打开新窗口、跳到别的网站
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const saves = require('./saveFiles.cjs');

/** 窗口标题、用户数据目录的名字（Steam 云同步的路径里会用到，改了要同步改 docs/desktop.md） */
const APP_NAME = 'Game Master';
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = 'http://localhost:5174';
const dev = process.argv.includes('--dev');

app.setName(APP_NAME);
// 自动测试用：把用户数据目录指到别处，不碰玩家真正的存档
if (process.env.GM_USER_DATA) app.setPath('userData', process.env.GM_USER_DATA);
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const userData = () => app.getPath('userData');
ipcMain.on('save:read', (e, name) => { try { e.returnValue = saves.read(userData(), name); } catch { e.returnValue = null; } });
ipcMain.on('save:write', (e, name, text) => { e.returnValue = saves.write(userData(), name, text); });
ipcMain.on('app:quit', () => app.quit());

/** app://game/<路径> → dist/<路径>（只能读 dist 里面的东西） */
function serveDist(request) {
  const { pathname } = new URL(request.url);
  const file = path.normalize(path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  if (!file.startsWith(DIST + path.sep)) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    title: APP_NAME, backgroundColor: '#0b0b14', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
  });
  // 外链交给系统浏览器；网页里不开新窗口、不跳走
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(dev ? DEV_URL : 'app://')) event.preventDefault(); });
  void win.loadURL(dev ? DEV_URL : 'app://game/index.html');
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', serveDist);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
