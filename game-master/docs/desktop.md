# 桌面版（Electron）与 Steam 云存档

## 怎么跑

| 命令 | 做什么 |
| --- | --- |
| `npm run desktop` | 先 `npm run build` 打包网页，再用 Electron 打开 `dist/`（和发布出去的样子一样） |
| `npm run desktop:dev` | 直接连开发服务器 `http://localhost:5174`（要先 `npm run dev`），改代码热更新 |
| `npm run desktop:pack:win` / `:mac` / `:linux` | 打包成免安装的目录（`release/win-unpacked`、`release/mac-universal`、`release/linux-unpacked`），就是传到 Steam 的内容 |
| `npm run steam:upload` | 把打包好的目录传到 Steam（SteamPipe），见下面「上传到 Steam」 |

桌面版是线上版本（`import.meta.env.PROD`）：没有地图编辑器和技术验证编辑器，只有游戏；标题菜单的「退出」直接关掉游戏，F11 或设置里切换全屏。

## 结构

```
electron/
  main.cjs       主进程：开窗口、用 app://game/ 协议加载 dist/、存档的 IPC、退出前等存档写完、全屏、外链交给系统浏览器
  preload.cjs    给网页挂 window.gameDesktop（存档读写、退出、全屏、退出前的回调），网页本身碰不到 Node
  saveFiles.cjs  存档文件的读写（纯 Node，测试在 tests/electron/）
  steam.cjs      可选的 Steam 连接（steamworks.js）：认出是哪个 Steam 账号，打开 Overlay
scripts/steam-upload.mjs、steamBuild.mjs   SteamPipe 上传（构建脚本是纯函数，测试在 tests/scripts/）
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
| `save` | 玩家的进度（`run`，含剧情标记）+ 语言、音量 | 几百字节 | `localStorage['climb:save']` | `<用户数据目录>/save/<SteamID>/save.json`（不是从 Steam 启动的：`save/save.json`） |
| `editor` | 开发期编辑器的工作区（整个项目） | 约 80 KB | `localStorage['climb:editor']`（只有开发版） | `<用户数据目录>/workspace/editor.json`（桌面版用不到） |

- 只在检查点（进层、换房间、跳出 / 回到画面）、剧情走到下一步和改设置时写 `save`，300 毫秒防抖；关页面 / 关窗口前（`pagehide`）把没写的马上写掉。
- 桌面版退出（菜单「退出」、Cmd+Q、关窗口）时，主进程先发 `app:flush` 叫网页把还没写的写完（写是同步的），网页回 `app:flushed` 之后才真的退出（最多等 1.5 秒）。Steam 在游戏进程退出之后才上传云存档，所以传上去的一定是最新的。
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

用 Steam 的 **自动云同步（Steam Auto-Cloud）**：Steam 在游戏启动前把云端的文件放回来、退出后把改过的文件传上去，游戏自己不用调云存档的接口。

### 按 Steam 账号分开存

一台电脑上可能有几个 Steam 账号玩同一个游戏。从 Steam 启动时（Steam 会设环境变量 `SteamAppId`），`electron/steam.cjs` 用 [steamworks.js](https://github.com/ceifa/steamworks.js)（`optionalDependencies`，装不上也不影响游戏）认出当前账号的 64 位 SteamID，存档写到 `save/<SteamID>/save.json`，各个账号各存各的、各同步各的。

- 没从 Steam 启动、没装 steamworks.js、Steam 没开：当没有 Steam，存档写在公共的 `save/save.json`（和以前一样）。
- 某个账号第一次从 Steam 启动、自己的文件夹里还没有存档：把公共的那份复制一份过去（接 Steam 之前玩的进度不会丢），公共的留着不动。
- 开发时想在本机接 Steam 测：开着 Steam、登录有这个游戏的账号，`GM_STEAM_APP_ID=<App ID> npm run desktop`（没有自己的 App ID 可以用 Valve 的测试 App `480`）。

### Steamworks 后台怎么填

App Admin → Cloud：

1. 字节配额填 `1048576`（1 MB），每个用户的文件数填 `8`。
2. 启用 Auto-Cloud，加一条根路径：

| 字段 | 值 |
| --- | --- |
| Root | `WinAppDataRoaming` |
| Subdirectory | `Game Master/save/{64BitSteamID}` |
| Pattern | `save.json` |
| OS | All OSes |
| Recursive | 不勾 |

3. Root Overrides 加两条，让 Mac / Linux 用同一份云端文件：
   - `WinAppDataRoaming` → macOS → `MacAppSupport`（Subdirectory 不变）
   - `WinAppDataRoaming` → Linux → `LinuxXdgConfigHome`（Subdirectory 不变）

注意：

- 只同步 `save.json`。`.bak`、`.tmp`、公共的 `save/save.json` 和编辑器的 `workspace/` 都不同步。
- 存档里有 `savedAt`（写入时间），两台电脑冲突时 Steam 让玩家选，能看出哪个新。
- 改了 `APP_NAME`（`electron/main.cjs`）会换用户数据目录，Steam 的 Subdirectory 要跟着改，老玩家的存档也会「消失」——发布后不要再改。

## 打包

用 [electron-builder](https://www.electron.build/)，配置在 `package.json` 的 `build`：

- 只打包 `dist/`（网页已经由 Vite 打成一个包）、`electron/` 和 steamworks.js；别的 `node_modules` 都不进安装包。
- steamworks.js 的原生模块和 Steam 的运行库放在 asar 外面（`asarUnpack`），不然加载不了。
- 目标都是免安装目录（`dir`）：Steam 自己负责安装和更新，不需要安装程序。
  - Windows：x64，`release/win-unpacked/Game Master.exe`。没改可执行文件的图标和版本信息（`signAndEditExecutable: false`，这样在 Mac 上也能打 Windows 版，不用装 Wine）；要改图标就在 Windows 上打包并去掉这一项。
  - macOS：Intel + Apple 芯片的通用版，`release/mac-universal/Game Master.app`。没有签名（`identity: null`）；要公证就填开发者证书。
  - Linux：x64，`release/linux-unpacked/`。
- 现在用的是 Electron 默认图标；做好图标后放进 `build/`（`icon.icns`、`icon.ico`、`icon.png`），electron-builder 会自己用上。

## 上传到 Steam

`scripts/steam-upload.mjs` 生成 SteamPipe 的构建脚本（`steam/build/`，不进仓库），再用 `steamcmd` 上传。

1. 装 [steamcmd](https://developer.valvesoftware.com/wiki/SteamCMD)，第一次手动 `steamcmd +login <账号>` 登录一次（输密码和 Steam 令牌，之后会记住）。
2. 在 `game-master/.env.steam.local`（不进仓库）写上：

```
STEAM_APP_ID=你的 App ID
STEAM_DEPOT_WIN=Windows 的 depot 号
STEAM_DEPOT_MAC=macOS 的 depot 号
STEAM_DEPOT_LINUX=Linux 的 depot 号
STEAM_USER=有上传权限的账号
# 可选：传完自动设成这个测试分支的当前版本；不能是 default
STEAM_BRANCH=beta
```

3. 打包要传的平台，然后上传：

```bash
npm run desktop:pack:win
npm run desktop:pack:mac
npm run steam:upload -- --dry-run
npm run steam:upload
```

- `--dry-run` 只生成构建脚本、打印要跑的命令，不登录、不上传；生成的 app 构建脚本带 `Preview 1`，就算拿去跑也只算不传。
- 没设 depot 号、或者还没打包的平台自动跳过。
- 脚本**不会**把构建设成 `default` 分支（正式版本）的当前版本；正式上线在 Steamworks 后台手动点。

## 还没做的

- Steam 成就、Steam 输入（手柄配置）：steamworks.js 已经接上了，要用时在 `electron/steam.cjs` 里加。
- 图标、macOS 签名和公证、Windows 可执行文件的版本信息。
