# 主线剧情

剧本分三段：开场（标题画面）→ 第一幕（银河城）→ 第一幕的结尾（「继续」了已经结束的游戏，在城堡前面见到 Game Master，被拖进关卡编辑器）。第二幕从「骷髅手开始在玩家眼前用关卡编辑器改造游戏」开始，现在做到改造的第一段为止，画面上提示「未完待续」。

## 代码在哪

剧情的**数据**和**画面**分开放，三块各管一摊：

| 位置 | 管什么 | 依赖 |
| --- | --- | --- |
| `src/story/` | 剧情的数据：走到哪了（标记）、哪一层是哪一幕、剧本、演出的名单、编辑器改造画哪些格子 | 不依赖任何引擎（ESLint 管着），游戏和界面两边都读 |
| `src/game/mechanics/story/` | 游戏里的那部分：开场搭房间、GM 的化身和剧本执行器 | Phaser，通过 `PlayContext` |
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
  Opening.ts      标题画面第一段：骷髅手一挥，房间一条条从天上砸下来
  Gm.ts           GM 的化身 g：通关之后走近自动说剧本，演出期间接管人（takesControl），说完被拖进编辑器
src/ui/story/
  StoryLayer.tsx  叠在游戏画布上的一层：开场、演出、编辑器外壳都挂在这
  GmHand.tsx      骷髅手（gm_hand.png 四个姿势 + 平铺的前臂 gm_arm.png）
  OpeningMenu.tsx 拍标题和菜单、手指着选中的那一项、开始时扫走
  SettingsPanel.tsx  音乐音量、语言、全屏、清除进度
  Celebration.tsx    第一幕的结局画面（「你赢了！」）
  EditorShell.tsx    第二幕：游戏画面缩进关卡编辑器
  cutscenes/      四段演出，每段一个组件，index.tsx 的 CUTSCENE_VIEWS 按 id 对上（少一个编译不过）
  AudioGate.tsx   网页版第一屏「按任意键」（浏览器在玩家按键之前不让出声）
```

## 一路走下来

1. **开场**（`StartGameData.opening`）。游戏页一打开就起游戏场景（有存档就是存档的那个房间）。剧情机制的 `delaysEntrance()` 让场景先别放主角，HUD 是 `opening` 模式（不显示）。
   - `Opening` 先让画面一片黑。骷髅手从左往右一挥（`EVT.storyHand` 告诉界面手在哪），手扫过哪一条，那一条房间就从画面上方砸下来、弹两下、扬灰，最后一条落地时画面一震。每一条是一个只看那一条的镜头，房间里的东西照常画，不用复制画面。
   - 落完发 `EVT.openingBuilt`，界面把标题和三个按钮一个个拍进来（画面一震，「咚」）。
   - 菜单里手指着选中的那一项。「开始」：手把标题和按钮扫出画面，发 `EVT.openingStart`，场景调 `ctx.enter()` 放主角出场、换成这一层的音乐。「设置」里清除了进度再「开始」：从头开一局（`ctx.newGame()`）。
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
- **换音乐、音效**：占位的都是 `scripts/gen-story-audio.mjs` 合成的（`node scripts/gen-story-audio.mjs` 重新生成）。开场音乐是音频清单里的 `openingMusic`（`story/config.ts` 的 `STORY_MUSIC`）；音效清单在 `asset/storyAudio.ts`。正式的文件直接覆盖 `src/asset/story/` 里同名的 mp3。
- **地图**：GM 的化身是物件 `g`，在编辑器物品栏的「物件」里，文字关卡也认（`levels/README.md`）。编辑器改造画的格子（`montage.ts`）是 GM 所在房间里的坐标，挪了 GM 要检查那些格子还是空的（测试会查）。
