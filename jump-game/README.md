# Jump Game (Phaser 3)

一个 2D 横版跳跃小游戏，Phaser 3 通过 CDN 引入，无需构建。

## 运行

任选一种：

```bash
npx serve jump-game
```

或者用 Python：

```bash
cd jump-game && python3 -m http.server 8080
```

然后打开 http://localhost:8080 （用 `npx serve` 的话看终端提示的端口）。

## 操作

- `← →` 或 `A D`：移动
- `空格` / `↑` / `W`：跳跃，支持二段跳
- `R`：重开关卡

## 玩法

- 吃金币 +1，踩敌人 +2
- 碰到尖刺、被敌人撞到、掉出屏幕 → 游戏结束
- 走到最右边的旗帜 → 通关

## 结构

```
jump-game/
├── index.html
└── src/
    ├── config.js            # 重力、速度、跳跃等手感参数
    ├── main.js              # Phaser 配置与启动
    └── scenes/
        ├── BootScene.js     # 用代码生成贴图
        ├── GameScene.js     # 关卡、玩家、敌人、金币、碰撞
        └── GameOverScene.js # 结算画面
```

关卡布局在 `GameScene.js` 的 `layout`、`coinSpots`、尖刺和敌人数组里，直接改坐标即可。
