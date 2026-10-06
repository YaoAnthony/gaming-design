// ===== 主线剧情走到哪了：存档里的事件标记（run.flags，见 type/run.ts）=====
// 每个标记是「这件事已经发生过」，只增不减；重新开始一局（清空存档）才全部清掉。
// 游戏一侧用 ctx.story.has / flag 读写（试玩时只记在这一场里，不进存档），界面一侧读 store 的 run.flags。
export const STORY = {
  /** 第一幕：碰到终点城堡，看到了「你赢了！」 */
  act1Won: 'act1.won',
  /** 在庆祝画面上按了「继续」：角落那段墙塌开，通往施工区 */
  act1Continued: 'act1.continued',
  /** GM 检查庆祝画面时把「继续」按钮揉成一团扔了：之后的庆祝画面没有「继续」 */
  continueRemoved: 'act1.continueRemoved',
  /** 见到了 GM，对话说完了 */
  metGM: 'act1.metGM',
  /** 第二幕：被拖进了关卡编辑器，GM 开始改造游戏 */
  act2Editor: 'act2.editor',
} as const;

export type StoryFlag = typeof STORY[keyof typeof STORY];

/** 这些标记里有没有这一个 */
export const hasFlag = (flags: Record<string, true> | undefined, f: StoryFlag): boolean => !!flags?.[f];
