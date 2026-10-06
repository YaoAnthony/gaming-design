// ===== 演出的名单：游戏一侧按名字请界面一侧放（EVT.storyCutscene），放完回 EVT.storyCutsceneDone =====
// 每一段的实现在 ui/story/cutscenes/（defineCutscene 登记）；测试会查这里的每一个都有实现
export const CUTSCENES = {
  /** GM 把庆祝画面拽进屏幕，手从上往下摸到「继续」按钮，发抖，揉成一团扔出去，再把庆祝画面推出去 */
  inspectCelebration: 'inspectCelebration',
  /** 把关卡编辑器拉出来，把主角拖进编辑器里对应的位置 */
  pullEditor: 'pullEditor',
  /** 把 GM 的化身（NPC）也拖进编辑器 */
  dragGM: 'dragGM',
  /** GM 开始用关卡编辑器改造游戏 */
  editorMontage: 'editorMontage',
} as const;

export type CutsceneId = typeof CUTSCENES[keyof typeof CUTSCENES];
