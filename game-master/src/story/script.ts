// ===== 剧情脚本：一段按顺序走的步骤（对话、自动翻页的「思考」、演出、记下一个标记）=====
// 脚本是纯数据（scripts/*.ts），游戏一侧的执行器（game/mechanics/story/runScript.ts）一步步走：
// - say：一句对话，玩家跳一下翻一句（跳的时候照样会起跳爆炸——GM 会被炸到）
// - think：自动翻页的一句，显示 ms 毫秒（跳一下也能跳过）
// - cutscene：交给界面一侧放一段演出（ui/story/cutscenes/），人在演出时不归玩家管，放完才往下走
// - flag：记下「这件事发生过」（存档）
import type { StoryFlag } from './flags';
import type { CutsceneId } from './cutscenes';

export type ScriptStep =
  | { say: string; avatar?: string }
  | { think: string; ms: number }
  | { cutscene: CutsceneId }
  | { flag: StoryFlag };

export interface StoryScript {
  /** 谁在说（i18n key） */
  speaker: string;
  /** 默认头像（asset 的 AVATARS） */
  avatar?: string;
  steps: ScriptStep[];
}

/** 一段相邻的对话（say / think）合成一次对话框；遇到演出、标记就断开。执行器按这个分段走 */
export type ScriptChunk =
  | { kind: 'talk'; lines: { text: string; avatar?: string; autoMs?: number; think?: boolean }[] }
  | { kind: 'cutscene'; id: CutsceneId }
  | { kind: 'flag'; flag: StoryFlag };

export function chunksOf(script: StoryScript): ScriptChunk[] {
  const out: ScriptChunk[] = [];
  for (const s of script.steps) {
    if ('say' in s || 'think' in s) {
      const line = 'say' in s ? { text: s.say, avatar: s.avatar } : { text: s.think, autoMs: s.ms, think: true };
      const last = out[out.length - 1];
      if (last?.kind === 'talk') last.lines.push(line); else out.push({ kind: 'talk', lines: [line] });
    } else if ('cutscene' in s) out.push({ kind: 'cutscene', id: s.cutscene });
    else out.push({ kind: 'flag', flag: s.flag });
  }
  return out;
}

/** 从第几段接着走：最后一个已经记下的标记之后（中途被打断、读档回来不用从头再看一遍） */
export function resumeIndex(chunks: ScriptChunk[], has: (f: StoryFlag) => boolean): number {
  let from = 0;
  chunks.forEach((c, i) => { if (c.kind === 'flag' && has(c.flag)) from = i + 1; });
  return from;
}
