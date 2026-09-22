# Climb

「起跳即爆炸」的房间制解谜平台游戏。Vite + React + TypeScript + Phaser 3 + Redux Toolkit。

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
├── map/                # world.json：房间字符画 + 布局 + 房间名（唯一地图数据源）
├── sprite/             # Player（移动、滑墙、蹬墙跳）、Enemy（巡逻）
├── particle/           # 爆炸、落石压扁等特效
├── game/               # Phaser 本体
│   ├── registry/       # 注册表 + 能力特征（registry.ts），所有砖块与物件的注册（tiles.ts）
│   ├── terrain/        # 格子地形：爆炸、连锁、支撑检测、碎块下落、房间重置
│   ├── world/          # 世界模型纯函数：拼图、找出生点、加房间
│   ├── scenes/         # Boot（加载资产）、Game、Editor
│   ├── bridge.ts       # React ↔ Phaser 事件总线与场景名
│   └── PhaserGame.ts   # 创建 / 销毁 Phaser 实例
└── ui/                 # React 界面：游戏页 + HUD、编辑器侧边栏
```

## 数据流

- **地图**：`map/world.json` 是默认地图；运行时的地图在 Redux `editor.model` 里，编辑器改的就是它，游戏也用它。自动存进 localStorage。编辑器「导出 world.json」覆盖到 `src/map/` 就成为新的默认地图。
- **存档**：游戏每进一个房间就把整张地图的当前格子状态、入口、统计写进 Redux `save`，并持久化。游戏页「继续」从存档恢复。
- **参数**：`game/config.ts` 是默认值，运行时在 Redux `config` 里，将来可以做调参面板。
- **Phaser → React**：直接 dispatch 到 `hud` / `save`。**React → Phaser**：`game/bridge.ts` 的事件总线，或场景启动时传数据。

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
| `Hazard('提示')` | 碰到即死 |
| `Hidden` | 不在编辑器物品栏显示 |

新砖块要有图集帧：在 `scripts/gen-art.mjs` 里画一帧（或换成手绘 PNG），在 `asset/index.ts` 的 `TILE_FRAMES` 加序号，然后注册。

## 操作

| 按键 | 动作 |
| --- | --- |
| ← → / A D | 移动 |
| 空格 / ↑ / W | 起跳（起跳点爆炸） |
| 贴墙下滑时按跳 | 蹬墙跳（墙面爆炸） |
| R | 重置当前房间 |
| ESC | 试玩时回编辑器 |
