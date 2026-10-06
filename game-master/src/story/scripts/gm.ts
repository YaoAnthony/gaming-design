// ===== 第一幕的结尾：玩家「继续」了已经结束的游戏，在城堡前面（第一层房间 P）见到 Game Master =====
// 台词在 i18n 的 story.gm（数组，按下标）；这里只排顺序、插演出、记标记。
// 走近 GM 自动开始，跳一下翻一句；中途被打断（死了、换层），下次从最后记下的那个标记之后接着说。
import { STORY } from '../flags';
import { CUTSCENES } from '../cutscenes';
import type { ScriptStep, StoryScript } from '../script';

const say = (i: number, avatar?: string): ScriptStep => ({ say: `story.gm.${i}`, avatar });
const range = (from: number, to: number, avatar?: string): ScriptStep[] => Array.from({ length: to - from + 1 }, (_, k) => say(from + k, avatar));
/** 「已深度思考 Ns……」：自己翻页，显示 N 秒（跳一下能跳过） */
const think = (i: number, sec: number): ScriptStep => ({ think: `story.think.${i}`, ms: sec * 1000 });

export const GM_SCRIPT: StoryScript = {
  speaker: 'npc.gameMaster',
  avatar: 'default',
  steps: [
    ...range(0, 16),
    { cutscene: CUTSCENES.inspectCelebration },      // 把庆祝画面拽进来检查，揉掉「继续」按钮
    { flag: STORY.continueRemoved },
    ...range(17, 36),
    think(0, 1), think(1, 2), think(2, 4), think(3, 8), think(4, 16),
    ...range(37, 43),
    say(44, 'laugh'), say(45, 'laugh'),
    ...range(46, 47),
    { cutscene: CUTSCENES.pullEditor },              // 拉出关卡编辑器，把主角拖进去
    say(48),
    { cutscene: CUTSCENES.dragGM },                  // 把 GM 的化身也拖进编辑器
    { flag: STORY.metGM },
    { flag: STORY.act2Editor },
    { cutscene: CUTSCENES.editorMontage },           // 骷髅手开始用关卡编辑器改造游戏
  ],
};

/** 台词一共多少句（i18n 里 story.gm 的长度要和它对上，测试会查） */
export const GM_LINES = 49;
export const GM_THINKS = 5;
