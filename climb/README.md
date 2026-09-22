# Climb

「起跳即爆炸」的房间制解谜平台游戏。Vite + React + TypeScript + Phaser 3 + Redux Toolkit + Ant Design（弹窗等界面组件）+ Motion（界面动画）。

## 命令

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器 http://localhost:5174
npm run build      # 类型检查 + 打包到 dist/
npm test           # vitest 单元测试
npm run gen-art    # 重新生成占位 PNG 美术到 src/asset/
```

## 目录

```
src/
├── main.tsx            # React 入口（Provider + App）
├── redux/              # 状态：config（可调参数）、editor（地图模型、笔刷、当前房间）、save（存档）、hud（Phaser 推给 React 的数据）
│   ├── store.ts        # store + localStorage 持久化（地图、存档）
│   └── slices/
├── type/               # 所有 TypeScript 类型：砖块能力、物件、世界模型、存档、配置
├── asset/              # PNG 资产 + 清单（index.ts）。图集帧序号在这里定义
├── map/                # world.json：房间字符画 + 布局（唯一地图数据源）
├── sprite/             # Player（移动、滑墙、蹬墙跳）、Enemy（巡逻）
├── particle/           # 爆炸、落石压扁等特效
├── game/               # Phaser 本体
│   ├── registry/       # 注册表 + 能力特征（registry.ts），砖块与物件的注册（tiles.ts），角色技能的注册（skills.ts）
│   ├── terrain/        # 格子地形：爆炸、连锁、支撑检测、碎块下落、房间重置
│   ├── world/          # 世界模型纯函数：拼图、找出生点、加房间
│   ├── scenes/         # Boot（加载资产）、Game、Editor
│   ├── bridge.ts       # React ↔ Phaser 事件总线与场景名
│   └── PhaserGame.ts   # 创建 / 销毁 Phaser 实例
└── ui/                 # React 界面：游戏页 + HUD + 通关庆祝（Motion 彩纸）、编辑器侧边栏（物品栏、房间缩略图布局）
```

## 数据流

- **房间布局**：`layout` 是稀疏网格，`null` 是空位（游戏里是实心岩石）。编辑器里房间以缩略图显示，可拖拽交换 / 移动，任意空位点「+」新建，选中的房间可删除。
- **地图**：`map/world.json` 是默认地图；运行时的地图在 Redux `editor.model` 里，编辑器改的就是它，游戏也用它。自动存进 localStorage。开发服务器下编辑器有「写入 src/map/world.json」按钮（Vite 插件 `climb-save-map` 提供的 `POST /__climb/save-map`），一键写回源码；打包版本用「导出 world.json」手动覆盖。
- **存档**：游戏每进一个房间就把整张地图的当前格子状态、入口、统计写进 Redux `save`，并持久化。游戏页「继续」从存档恢复。
- **参数**：`game/config.ts` 是默认值，运行时在 Redux `config` 里，将来可以做调参面板。
- **Phaser → React**：直接 dispatch 到 `hud` / `save`。**React → Phaser**：`game/bridge.ts` 的事件总线，或场景启动时传数据。

## 地图迷雾

`game/fog/Fog.ts`。三种状态：没见过（全黑，地形 / 怪物 / 引线端点 / 爆炸预览都看不到）、见过但不在视野（半透明，能看地形看不到怪）、视野里（清晰）。

- **光照扩散**：从玩家所在格出发沿空气逐格衰减（`config.fogRadius`，默认 7 格），实心格被照亮但挡住后面。炸开一堵墙，光会立刻透进去。
- **迷雾区**：编辑器里可以画 1-4 号区（叠在砖块上，不影响地形），没揭开前无论多亮都全黑；玩家踏进区内任一格整区永久揭开。用来藏秘密通道。
- **房间开关**：房间面板里勾「这个房间不要迷雾」。迷雾默认关闭（`config.fogEnabled`），游戏页工具栏可以打开。
- 探索记忆随存档保存，不随死亡 / R 重置消失。渲染是一张房间大小的 RenderTexture，只在玩家换格子或地形变化时重画。

## 规则与砖块

砖块能力全部在 `game/registry/tiles.ts` 注册，用特征组合声明：

```ts
defineTile({ id: 'B', name: '脆岩', color: 0xc9b27c, frame: TILE_FRAMES.brittle },
  Traits.Solid, Traits.Destructible(1), Traits.Chain);
```

| 能力 | 含义 |
| --- | --- |
| `Solid` | 实心，挡住玩家、怪物、碎块 |
| `Anchor` | 锚点：自己永不掉落，相连的实心格子都被它撑住 |
| `Destructible(n)` | 可被爆炸摧毁；`n` 是额外感应半径（格） |
| `Chain` | 被波及后沿同类格子连锁崩塌 |
| `Loose(n)` | 周围有爆炸就整块松脱掉落（范围外再加 n 格感应），相连同类一起掉 |
| `Hazard('提示')` | 碰到即死 |
| `Delay(ms)` | 连锁传导时每跳延迟 ms 毫秒才摧毁，能看到火苗跑过去 |
| `EndsOnly` | 只有链条两端能被爆炸点燃，中间段免疫 |
| `Hidden` | 不在编辑器物品栏显示 |

### 角色技能

起跳时发生什么也是注册表（`game/registry/skills.ts`）。技能拿到一个 `SkillContext`（查地形、摧毁格子、放特效），自己决定炸哪里、预览画什么：

```ts
defineSkill({
  id: 'drill', name: '定向钻孔',
  onJump(ctx) { const removed = ctx.destroy(ctx.previewCells(cells)); ctx.fx(ctx.jump.cell, removed, 1); },
  preview(ctx, jump) { return { outline: cells, removed: ctx.previewCells(cells) }; },
});
```

当前有 `blast`（默认，起跳点圆形爆炸）和 `drill`（示例，1 格宽 3 格深的定向钻孔）。用哪个由 `config.skill` 决定，游戏页有下拉可以切换。

### 引线（`game/fuse/Fuse.ts`）

引线**不是砖块**，是叠在地形之上的一层（`model.fuse[房间]`，`'W'` = 有引线），不占格子、不挡人，可以穿过空气和任何砖块。只有两端（同类邻居 ≤ 1）能被爆炸点燃（`config.fuseIgniteRadius`），点燃后从那头沿引线一格格烧过去（`config.fuseDelayMs`），烧到哪格就把那格的地形炸掉，**岩石也炸**（引线是唯一能开岩石的手段；岩石是锚点，炸掉后周围失去支撑的泥土会跟着掉）；经过空气只是过一下。游戏里只画端点（黄色节点），中间段完全不可见；编辑器里整条线自动拼贴显示。烧掉的引线随存档保存，R 重置房间会恢复。引线可以**跨房间**：两个房间交界处相邻的引线格会拼成一条，火照样烧过去；编辑器里边缘格会显示成连向隔壁，缩略图上也画出引线方便对齐。注意 R 只恢复当前房间那一段，已经烧到隔壁的部分不会回来。

引线在编辑器里的贴图是**自动拼贴**：按上/右/下/左有没有引线取 16 帧之一（`frame + 掩码`，上=1 右=2 下=4 左=8）。砖块系统也支持同样的机制：任何砖块加上 `autotile: true` 并在图集里放 16 帧即可；`gameFrame` 可以让砖块在游戏里和编辑器里长得不一样。

新砖块要有图集帧：在 `scripts/gen-art.mjs` 里画一帧（或换成手绘 PNG），在 `asset/index.ts` 的 `TILE_FRAMES` 加序号，然后注册。

## 操作

| 按键 | 动作 |
| --- | --- |
| ← → / A D | 移动 |
| 空格 / ↑ / W | 起跳（起跳点爆炸） |
| 贴墙下滑时按跳 | 蹬墙跳（墙面爆炸） |
| R | 重置当前房间 |
| ESC | 试玩时回编辑器 |
