# 分层背景

每个房间使用 `woodland-字母/` 文件夹，Vite 自动发现数字文件，按数字由远到近叠放：

- `1.far.png`：完整远景底板。
- `2.clouds.png`：透明云层，沿用约 35 秒周期的轻微横移动画。
- `3.middle.png`：中景树木、木架、石墙。
- `4.near.png`：近处枝叶、根石，轻风只作用于适合摆动的叶片。

当前 f2 的 20 个房间全部有图，包括 L、T、R、S、Q、P。P 的背景石台按城堡实际底边定位（960×640 房间内，城堡范围 x=752..880、y=48..160），游戏现有城堡继续负责交互。O 的石阶向右延伸到 P。

导出尺寸统一为 **1920×1280**，保持游戏房间 3:2 比例；新生成原稿约 1500×1000，导出经过放大，并非原生 1080p 生成。原稿、50px 邻图参考条、提示词、接缝报告和全图预览保存在：

`设计稿/art/B1_wood_stage/output/backgrounds/floor1-woodland-v3/`

## 重建与校验

在 game-master 下运行（Python 需要 Pillow、NumPy）：

```text
python scripts/rebuild-woodland.py build
python scripts/rebuild-woodland.py check
```

构建直接读取 `src/map/world.json` 的 f2 当前布局，不再使用旧的三排固定布局。`check` 对四层的所有上下左右相邻边缘逐像素核对。旧的 `split-backgrounds.py` / `split-clouds.py` 命令也转交给此构建流程；旧命令上的模糊参数不再生效，当前虚化在构建脚本中固定为远景 2.4、中景 0.65 原稿像素。

重新生成单房间时，先在原画目录的 `plan.json` 定义邻图，执行 `prepare ROOM` 得到边缘参考；内置 imagegen 生成结果和提示词记入 `generation.json`，`import` 归档原图并裁去参考条。之后 `build` 导出四层。

**移动房间后应先检查主题和树干、地平线的衔接，再生成或修改受影响原画。** 构建脚本只做边缘校正，不能凭空重新画出跨房间的完整物体。

分层采用调色板与轮廓近似遮罩，隐藏区域仅补低频底色，所以保持位移视差为 0。轻景深只作用于背景，不模糊角色、地形或 HUD。所有层同尺寸、同画布位置，保留透明空白；全部加载完成后统一显示。

`background.json` 保留兼容的背景 id、显示名、`pixelated: true` 与 `ambient: woodland`。删除 ambient 字段可关闭林地动效；减少动态效果偏好会停止云、风和雾的移动。每房间使用六颗低亮微光，四边风幅渐变为零，保证房间接触边缘不被动画拉开。
