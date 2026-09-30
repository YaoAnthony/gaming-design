# Game Master

「起跳即爆炸」的房间制解谜平台游戏。在线试玩：**https://yaoanthony.github.io/gaming-design/**

## News

### V0.2

1. **支持手柄游玩** <img src="docs/icon-controller.svg" height="22" alt="手柄" align="absmiddle"> <img src="docs/icon-button-a.svg" height="22" alt="A 键" align="absmiddle">
   Xbox 和 PS 手柄都行，左摇杆或十字键移动，A / ✕ 跳，Y / △ 重来，方向下放下钥匙或摘帽子。游戏会记住你最后用的是键盘还是手柄，标题页和死亡画面的按键提示跟着切换：换设备后的第一下只换提示，再按一下才生效。
2. **重做了第 1 关「Dungeon」**，学习曲线更平缓：起跳爆炸和蹬墙跳先练熟，钥匙与门、箱子、移动方块、飘落的纸、迷雾再逐个登场。
3. **死亡与特效**：死亡画面（U DEAD，按 R 或手柄重来）、起跳和落地的挤压拉伸、按 R 时整个画面揉成纸团再展开、迷雾和场景光照。界面按画面大小缩放，大屏幕上也是正常比例。

这一版顺带修了一批物理问题：贴着纸柱或移动方块的侧面起跳不再撞头，站在移动方块或被史莱姆驮着的纸上被带到墙边会被刮下来而不是穿墙，纸飘到头上会被人驮着走，箱子、钥匙和怪物都能站在纸上。

## Overview

**演示视频**：https://drive.google.com/file/d/1t3efJr8EjZo4hbtB1yDhAKjblJrqS2C8/view?usp=drive_link

你是一个会爆炸的小方块。每次起跳都会炸掉脚下那一格周围的砖，所以「怎么走」本身就是谜题：炸掉的砖再也回不来，炸错一块可能就把路断了，也可能正好打开一条新路。

- **一间一间的房间**，每间是一道题；按 R 只重置当前房间，死亡重置整张图。
- **一层一层的塔**：走进小城堡进入下一层，帽子和手上的道具可以带过去，钥匙留在本层。
- **地形会动**：沙土和脆岩失去支撑会塌，纸会慢慢飘落并被路过的史莱姆驮走，移动方块驮着人、箱子和钥匙来回走。
- **钥匙自己会开门**：钥匙有重力、会被怪物推，碰到同色的门就开。炸掉合适的砖，让钥匙自己掉到门上。
- **帽子和箱子**：戴上帽子变两格高，能推大箱子，但钻不过一格高的隧道。
- **迷雾**：有些区域揭开前伪装成墙，踏进去整片亮起。

| 操作 | 键盘 | 手柄 |
| --- | --- | --- |
| 移动 | ← → 或 A D | 左摇杆 / 十字键 |
| 跳（起跳爆炸） | 空格 / ↑ / W | A（PS：✕） |
| 放下钥匙 / 摘帽子 | ↓ / S | 方向下 |
| 重来 | R | Y（PS：△） |

## 开发

代码在 `game-master/`，技术栈是 Vite + React + TypeScript + Phaser 3 + Redux Toolkit。架构、机制注册表、地图编辑器和文字关卡格式见 [game-master/README.md](game-master/README.md)。

```bash
cd game-master
npm install
npm run dev     # http://localhost:5174，本地有地图编辑器
```

推到 `main` 后 GitHub Actions 自动打包并部署到 GitHub Pages。
