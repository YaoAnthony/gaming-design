// ===== 桌面版（Electron）的主进程 =====
// - 打包好的网页（dist/）用自定义协议 app://game/ 加载：资源路径和网页版一样是绝对路径，不用改 Vite 的 base，也没有 file:// 的跨域问题
// - `npm run desktop:dev`（带 --dev）直接连开发服务器 http://localhost:5174（要先 npm run dev）
// - 存档写在用户数据目录（saveFiles.cjs）；从 Steam 启动时按 Steam 账号分文件夹（steam.cjs），Steam 云按账号同步
// - 退出前先让网页把还没写的存档写完（app:flush → app:flushed），Steam 云在游戏退出后才上传，存档一定是最新的
// - 音频不用等玩家先按一下就能放（标题画面一打开就有音乐）
// - F11 切换全屏（设置里也能切）；不让网页打开新窗口、跳到别的网站
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const saves = require('./saveFiles.cjs');
const steam = require('./steam.cjs');

/** 窗口标题、用户数据目录的名字（Steam 云同步的路径里会用到，改了要同步改 docs/desktop.md） */
const APP_NAME = 'Game Master';
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = 'http://localhost:5174';
const dev = process.argv.includes('--dev');

app.setName(APP_NAME);
// 自动测试用：把用户数据目录指到别处，不碰玩家真正的存档
if (process.env.GM_USER_DATA) app.setPath('userData', process.env.GM_USER_DATA);
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// Steam：要在 app ready 之前接（打开 Overlay 要先加命令行开关）。没有 Steam 就是 null，存档放在公共的 save/ 里
const steamUser = steam.connect({ log: msg => console.log(`[steam] ${msg}`) });
const userData = () => app.getPath('userData');
const saveUser = steamUser?.steamId;
ipcMain.on('save:read', (e, name) => { try { e.returnValue = saves.read(userData(), name, saveUser); } catch { e.returnValue = null; } });
ipcMain.on('save:write', (e, name, text) => { e.returnValue = saves.write(userData(), name, text, saveUser); });
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', e => { const w = BrowserWindow.fromWebContents(e.sender); w?.setFullScreen(!w.isFullScreen()); });

/** 退出前让网页把存档写完：最多等这么久（网页卡住了也照样退出） */
const FLUSH_TIMEOUT_MS = 1500;
let flushed = false;
app.on('before-quit', event => {
  if (flushed) return;
  const wins = BrowserWindow.getAllWindows().filter(w => !w.webContents.isDestroyed());
  if (!wins.length) return;
  event.preventDefault();
  let left = wins.length;
  const finish = () => { if (flushed) return; flushed = true; app.quit(); };
  const onFlushed = () => { if (--left <= 0) { ipcMain.removeListener('app:flushed', onFlushed); finish(); } };
  ipcMain.on('app:flushed', onFlushed);
  setTimeout(finish, FLUSH_TIMEOUT_MS);
  wins.forEach(w => w.webContents.send('app:flush'));
});

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
  if (saveUser && saves.adoptShared(userData(), saveUser)) console.log('[steam] 接 Steam 之前的存档已复制到这个账号的文件夹');
  protocol.handle('app', serveDist);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
