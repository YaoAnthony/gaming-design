# 主线剧情

剧本分三段：开场（标题画面）→ 第一幕（银河城）→ 第一幕的结尾（「继续」了已经结束的游戏，在城堡前面见到 Game Master，被拖进关卡编辑器）。第二幕从「骷髅手开始在玩家眼前用关卡编辑器改造游戏」开始，现在做到改造的第一段为止，画面上提示「未完待续」。

## 代码在哪

剧情的**数据**和**画面**分开放，三块各管一摊：

| 位置 | 管什么 | 依赖 |
| --- | --- | --- |
| `src/story/` | 剧情的数据：走到哪了（标记）、哪一层是哪一幕、剧本、演出的名单、编辑器改造画哪些格子 | 不依赖任何引擎（ESLint 管着），游戏和界面两边都读 |
| `src/game/mechanics/story/` | 游戏里的那部分：标题音乐与开始游戏、GM 的化身和剧本执行器 | Phaser，通过 `PlayContext` |
| `src/ui/story/` | 界面上的那部分：骷髅手、标题菜单、设置、结局画面、四段演出、关卡编辑器外壳 | React，通过总线事件和 Redux |

```
src/story/
  flags.ts        剧情标记（存档 run.flags 里的 key）：act1.won / act1.continued / act1.continueRemoved / act1.metGM / act2.editor
  config.ts       第一幕 = 第一层（f2）；碰到哪一层的终点是哪一幕的结局（ENDINGS）；每一段的音乐；结局画面上有哪几个选项
  script.ts       剧本的格式：say（跳一下翻一句）、think（自己翻页）、cutscene（交给界面放一段演出）、flag（记下标记）
  scripts/gm.ts   GM 的剧本（台词在 i18n 的 story.gm，按下标）
  cutscenes.ts    演出的名单（id）
  montage.ts      第二幕开头：骷髅手在编辑器里画哪些格子
src/game/mechanics/story/
  index.ts        通用机制 story（每一层都启用），登记物件 g
  Gm.ts           GM 的化身 g：通关之后走近自动说剧本，演出期间接管人（takesControl），说完被拖进编辑器
src/ui/story/
  StoryLayer.tsx  叠在游戏画布上的一层：开场、演出、编辑器外壳都挂在这
  GmHand.tsx      Game Master 的木手：把状态（去哪、什么姿势、从哪边伸进来）登记到 handStore，GmHandLayer 的 3D 画布画最后登记的那一只
  GmHandLayer.tsx 画手的透明画布（stage3d/hand/HandView：glb 模型、卡通调色板材质、像素风）；没有 WebGL 时 GmHand 退回 gm_hand.png 的精灵（GmHandSprite）
  GameHandOverlay.tsx 游戏一侧要画的手（复活时捏着主角进场，game/core/respawnHand.ts 每帧发 EVT.gameHand）：换算坐标、登记给 handStore
  OpeningMenu.tsx 菜单直接显示、手指向选中的 UI、开始时标题落下且按钮淡出
  OpeningTitle.tsx 透明标题牌与棕色硬吊带（stage3d/title/TitleSignView）
  SettingsPanel.tsx  音乐音量、语言、全屏、清除进度
  Celebration.tsx    第一幕的结局画面（「你赢了！」）
  EditorShell.tsx    第二幕：游戏画面缩进关卡编辑器
  cutscenes/      四段演出，每段一个组件，index.tsx 的 CUTSCENE_VIEWS 按 id 对上（少一个编译不过）
  AudioGate.tsx   网页版第一屏「按任意键」（浏览器在玩家按键之前不让出声）
```

## 一路走下来

1. **开场**（`StartGameData.opening`）。游戏页一打开就起第一层出生房间的标题场景。剧情机制的 `delaysEntrance()` 让场景先别放主角，HUD 是 `opening` 模式（不显示）。
   - 房间和按钮直接显示。标题牌独立落入画面，由两条棕色硬吊带接住；木手只指向选中的菜单、设置和确认框选项，点击时轻戳一下。
   - 「开始 / 继续」：木手收起，按钮淡出，标题松开吊带落下，再发 `EVT.openingStart`。剧情机制通过 `ctx.startRun(mode)` 放主角出场或读取存档，切换到关卡音乐；有存档时选「开始」仍先确认覆盖进度。
   - 已删除手搭建房间、逐个拍入按钮和扫走菜单的演出，以及专用的镜头、计时器、灰尘和事件。
2. **第一幕**：第一层的平台解谜。碰到终点（`G`）时，`GameScene.win` 查 `ENDINGS`：这一层是第一幕的结局，不弹「通关！」，HUD 的 `ending` 带上选项，显示 `Celebration`。
3. **结局画面**：选项发 `EVT.endingChoice`。
   - 继续：记 `act1.continued`，接着玩。
   - 重新开始：清空存档，从第一层出生点开一局。
   - 退出：发 `EVT.toTitle`，游戏页重新起标题画面。
4. **GM**：在第一层房间 P 的上面一条走廊里，挡在城堡前面（原来那个骷髅 NPC 的位置）。看过「你赢了！」之后（`act1.won`）走近自动开始说；没通关之前他只是挡在那，不说话。剧本按 `chunksOf` 分段走：相邻的台词合成一次对话，演出和标记把它断开。演出期间 `takesControl()`：人不归玩家管。
   - `inspectCelebration`：把庆祝画面拽进来，手从上往下摸到「继续」，发抖，揉成纸团扔掉，再把画面推出去。之后记 `act1.continueRemoved`，结局画面上就没有「继续」了。
   - 「已深度思考 1s / 2s / 4s / 8s / 16s」：自己翻页（真的等那么久），跳一下能跳过。
   - `pullEditor`：游戏一侧把主角藏起来、把他在画面上的位置给过去；手拎起主角，关卡编辑器从四周套上来（游戏画面缩小），手把主角放回画布里同一个位置。
   - `dragGM`：手把 GM 的化身拎进编辑器物品栏里那一格。之后记 `act1.metGM`、`act2.editor`。
   - `editorMontage`：手在物品栏点一种砖，再一格格点到画布上，每点一格发 `EVT.storyPaint`，游戏一侧把砖画上。
5. **读档回来**：有 `act2.editor` 就一直套着编辑器、GM 不在了、改造过的格子直接画好（地形不进存档，按 `montage.ts` 每次进层重画）。中途被打断（死了、关游戏）：下次走近 GM，从最后记下的那个标记之后接着说。

试玩（编辑器里）时标记只记在这一场里，不读也不写存档。

## 改剧情

- **改台词**：`src/i18n/zh.json` / `en.json` 的 `story.gm`（数组，下标对应 `scripts/gm.ts` 里的 `say(n)`）。加了句子要在 `gm.ts` 里排进去，并改 `GM_LINES`。测试会查每一句两种语言都有、一句不落。
- **加一段演出**：`story/cutscenes.ts` 加一个 id；`ui/story/cutscenes/` 写一个组件（拿到 `cue`、`stage`、`done`，用 `useTimeline` 写时间线），在 `index.tsx` 的 `CUTSCENE_VIEWS` 里对上；剧本里写 `{ cutscene: id }`。演出要用的游戏里的位置，在 `Gm.play()` 里放进 `StoryCutscene`。
- **加一个标记**：`story/flags.ts`。游戏里用 `ctx.story.has / flag / watch`，界面里读 `store.run.flags`。
- **换音乐、音效**：占位的都是 `scripts/gen-story-audio.mjs` 合成的（`node scripts/gen-story-audio.mjs` 重新生成）。开场音乐是音频清单里的 `openingMusic`（`story/config.ts` 的 `STORY_MUSIC`）；音效清单在 `asset/storyAudio.ts`。正式的文件直接覆盖同名的 mp3：音效在 `src/asset/audio/story/`，开场音乐在 `src/asset/music/`。
- **地图**：GM 的化身是物件 `g`，在编辑器物品栏的「物件」里，文字关卡也认（`levels/README.md`）。编辑器改造画的格子（`montage.ts`）是 GM 所在房间里的坐标，挪了 GM 要检查那些格子还是空的（测试会查）。
