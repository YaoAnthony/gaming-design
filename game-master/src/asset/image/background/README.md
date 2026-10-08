# 分层背景

每个背景一个文件夹，文件名的数字按远到近排列。新增或替换图片后由 Vite 自动发现，无需逐张登记清单。

```text
background/
  woodland-a/
    background.json
    1.far.png
    2.clouds.png
    3.middle.png
    4.near.png
```

- 数字按数值排序：1、2、10，不按字符串排。支持 PNG、WebP、JPG；透明层使用 PNG / WebP。
- 所有图层必须同尺寸、同画布位置；保留透明空白，不能把树木裁成紧贴物体的尺寸。
- 第一层提供完整底色，中近景用透明背景。图层里的虚化会直接显示；编号只控制叠放次序。
- 所有层加载完成后一起显示。进场房间仍预加载，其他房间在后台加载，换楼层时回收。
- 非数字文件（如 overview.png）不作为图层；重复编号会报错。
- 默认关闭位移视差，保留跨房间接缝。虚化与位移是两件事：需要位移时必须先补全遮挡区域并重新检查接缝。

可选的 background.json：

```json
{ "id": "woodland-a-v1", "name": "木作森林 · A 月下林心", "pixelated": true }
```

不写配置时文件夹名就是背景 id 和显示名称。旧背景 id 可以继续使用，已有地图不用迁移。

## 森林背景的轻景深素材

14 个 woodland-* 文件夹，每个 1536×1024，P 保持原状。1.far 为远景底板，2.clouds 为独立云朵，3.middle 为带透明通道的中景树木/木架，4.near 为近处枝叶和根石。按原图调色板和轮廓近似分离，保留原图像素；被遮住的远景仅补低频底色，不适合直接打开位移视差。

虚化在导出时完成：原图像素半径分别为 2.4、0.65、0，折算到 960×640 游戏画布约为 1.5、0.4、0 像素。只影响背景，不处理人物、地形和 HUD。

重做或调整强度：运行 `python scripts/split-backgrounds.py --far-blur 2.4 --middle-blur 0.65`（需要 Pillow、NumPy）。脚本从仓库中的原稿读取，在连续画布中共享房间边界后处理，再导出每张图，保证每一层的接触像素一致。预览和检查报告位于 `game-master/output/background-depth/`。

## 森林环境动效

`background.json` 的 `"ambient": "woodland"` 启用近景局部轻风、远中景之间的流雾，以及每房间六颗低亮微光点。删除该字段就恢复静态背景。风只处理最后一层，幅度最多约 1.7 个游戏像素；暖棕色木架被排除，四边 6.5% 范围内逐渐归零。雾按世界坐标采样，跨房间接缝不会重新起一段；画面外的雾和微光不渲染。系统的减少动态效果偏好会停止风、雾的移动并隐藏新增微光。Canvas 渲染回退时保留流雾与微光，云和枝叶保持静态。

参数：`game/background/ambientMath.ts`（雾与微光）、`WoodlandWind.ts`（枝叶）。纹理仅创建一次，粒子使用固定池，不按帧创建图片或后处理模糊。

## 原画云朵

`2.clouds.png` 按文件名自动标为云层；9 个有云房间提取了原画中的云，其他房间这一层透明。月亮和山体仍在 1.far，A 里直接遮住月亮的小云保留静态，避免凭空补画月亮。云层在约 35 秒的周期内缓慢横移，最大偏移 22 个游戏像素，房间边界同样固定；偏好减少动态效果时停止。

`split-backgrounds.py` 最后会调用 `split-clouds.py --fresh`，得到每房间四层。只重新提取云时运行 `python scripts/split-clouds.py`，它使用 output/background-ambient/source-far 中的无损缓存。云层与天空校验记录在 output/background-ambient/clouds-check.json。
