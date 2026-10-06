// ===== 主线剧情的配置：哪一层是哪一幕、哪个终点是哪一幕的结局、每一段放什么音乐 =====
// 剧情的「骨架」写在这里，具体的台词在 scripts/、演出在 ui/story/cutscenes/、地图上的道具在 game/mechanics/story/。
import type { StoryFlag } from './flags';
import { STORY } from './flags';

/** 第一幕：银河城式的平台解谜（地图里的 f2 层，Dungeon）。终点城堡 = 第一幕的结局（「你赢了！」） */
export const ACT1_FLOOR = 'f2';

/** 碰到哪一层的终点是哪一幕的结局（不在这里的层：照旧是「通关！」弹窗、去下一层） */
export const ENDINGS: Record<string, 'act1'> = { [ACT1_FLOOR]: 'act1' };

/** 每一段放什么音乐（音频清单 asset/index.ts 的 key）。换成正式的曲子：改清单里那个 key 的文件就行 */
export const STORY_MUSIC = {
  /** 标题画面：骷髅手搭地图、拍标题和菜单 */
  opening: 'openingMusic',
  /** 第一幕：银河城（就是这一层自己的音乐，层设置里选） */
  act1: null,
} as const;

/** 庆祝画面上的选项。「继续」被 GM 扔掉之后就没有了 */
export type EndingChoice = 'continue' | 'restart' | 'quit';
export function endingChoices(flags: Record<string, true> | undefined): EndingChoice[] {
  return flags?.[STORY.continueRemoved] ? ['restart', 'quit'] : ['continue', 'restart', 'quit'];
}

/** 这些标记都有了，现在在哪一幕（给存档读回来时用：已经在编辑器里了，就直接进编辑器） */
export function storyStage(flags: Record<string, true> | undefined): 'act1' | 'editor' {
  return flags?.[STORY.act2Editor] ? 'editor' : 'act1';
}

export type { StoryFlag };
