# 桌面版（Electron）与 Steam 云存档

## 怎么跑

| 命令 | 做什么 |
| --- | --- |
| `npm run desktop` | 先 `npm run build` 打包网页，再用 Electron 打开 `dist/`（和发布出去的样子一样） |
| `npm run desktop:dev` | 直接连开发服务器 `http://localhost:5174`（要先 `npm run dev`），改代码热更新 |

桌面版是线上版本（`import.meta.env.PROD`）：没有地图编辑器和技术验证编辑器，只有游戏；标题页右下角多一个「退出」，F11 切换全屏。

## 结构

```
electron/
  main.cjs       主进程：开窗口、用 app://game/ 协议加载 dist/、存档的 IPC、F11 全屏、外链交给系统浏览器
  preload.cjs    给网页挂 window.gameDesktop（存档读写、退出），网页本身碰不到 Node
  saveFiles.cjs  存档文件的读写（纯 Node，测试在 tests/electron/）
src/platform/    游戏这一侧：按运行环境选存储后端（网页 = localStorage，桌面 = window.gameDesktop）
src/redux/persist.ts  存什么、怎么读回来（两份：save / editor），和存在哪无关
```

- 打包好的网页用自定义协议 `app://game/` 加载：资源是绝对路径（`/assets/…`），和网页版一样，不用改 Vite 的 `base`，也没有 `file://` 的跨域限制。
- 窗口开了 `contextIsolation` + `sandbox`，网页只能通过 preload 暴露的两三个函数和主进程说话。
- 音频不用等玩家先按键就能放（`autoplayPolicy: 'no-user-gesture-required'`），节奏关卡开场就能出声。

## 存档

游戏只认两份数据（`src/platform/storage.ts` 的 `SaveName`）：

| 名字 | 内容 | 大小 | 网页版 | 桌面版 |
| --- | --- | --- | --- | --- |
| `save` | 玩家的进度（`run`）+ 语言、音量 | 几百字节 | `localStorage['climb:save']` | `<用户数据目录>/save/save.json` |
| `editor` | 开发期编辑器的工作区（整个项目） | 约 80 KB | `localStorage['climb:editor']`（只有开发版） | `<用户数据目录>/workspace/editor.json`（桌面版用不到） |

- 只在检查点（进层、换房间、跳出 / 回到画面）和改设置时写 `save`，300 毫秒防抖；关页面 / 关窗口前（`pagehide`）把没写的马上写掉。
- 桌面版写文件是「先写 `.tmp` 再改名」，旧的那份留成 `.bak`；主文件坏了自动读 `.bak`。
- 每份都带格式版本（`format`），读的时候逐个字段检查，坏档不会让游戏起不来。
- 游戏更新后打包地图变了（`mapHash` 对不上）：**进度保留**，只是不回原来那个房间，从那一层的出生点开始。
- 旧版本把所有东西塞在一个 `localStorage['climb:v1']` 里，第一次打开新版本时自动拆成两份并删掉旧的。

用户数据目录（窗口名是 `Game Master`，见 `electron/main.cjs` 的 `APP_NAME`）：

| 系统 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\Game Master\` |
| macOS | `~/Library/Application Support/Game Master/` |
| Linux | `~/.config/Game Master/` |

## Steam 云存档

用 Steam 的 **自动云同步（Steam Auto-Cloud）**，不用接 Steamworks SDK：Steam 在游戏启动前把云端的文件放回来、退出后把改过的文件传上去。

在 Steamworks 后台 → App Admin → Cloud：

1. 字节配额填 `1048576`（1 MB，够用很多年），文件数填 `4`。
2. 启用 Auto-Cloud，加一条根路径：

| 字段 | 值 |
| --- | --- |
| Root | `WinAppDataRoaming` |
| Subdirectory | `Game Master/save` |
| Pattern | `save.json` |
| OS | All OSes |

3. Root Overrides 加两条，让 Mac / Linux 用同一份云端文件：
   - `WinAppDataRoaming` → macOS → `MacAppSupport`（Subdirectory 不变）
   - `WinAppDataRoaming` → Linux → `LinuxXdgConfigHome`（Subdirectory 不变）

注意：

- 只同步 `save.json`。`.bak`、`.tmp` 和编辑器的 `workspace/` 都不同步。
- 存档里有 `savedAt`（写入时间），两台电脑冲突时 Steam 让玩家选，能看出哪个新。
- 改了 `APP_NAME` 会换用户数据目录，Steam 的 Subdirectory 要跟着改，老玩家的存档也会「消失」——发布后不要再改。

## 还没做的

- 打包成安装包 / 上传 Steam depot（electron-builder 或 electron-forge）：现在 `npm run desktop` 只是本地跑。
- Steam 成就、Overlay、手柄配置等需要 Steamworks SDK（如 steamworks.js）的功能。
