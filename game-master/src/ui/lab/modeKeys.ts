// ===== 每种玩法在游戏里用哪些键（开发工具共用：谱面录制、试玩时的实时记录都只认这些）=====

/** 每种玩法认哪些键（KeyboardEvent.code；别的键按了不记）、照着怎么按 */
import type { ModeId } from '@/rhythm/modes';

export const MODE_KEYS: Record<ModeId, { codes: string[]; hint: string }> = {
  giveup: { codes: ['Space'], hint: '空格 = 跳（上高柱 / 跨尖刺）' },
  dash: { codes: ['Space'], hint: '空格 = 重力翻一次（方块上下排轮着来）' },
  taiko: { codes: ['KeyA', 'KeyD'], hint: 'A = 红，D = 蓝' },
  mania: { codes: ['KeyA', 'KeyS', 'KeyD'], hint: 'A S D = 三条道（按住 = 长按）' },
  osu: { codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'], hint: 'Q W E R = 四列的圈（按住 = 长按）' },
  saber: { codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'], hint: 'Q W E R = 方块在哪条道（游戏里是 A D 移过去、空格砍）' },
  dodge: { codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'Space'], hint: '障碍出现的位置：Q W E R = 四条道，空格 = 一整排黄杠' },
};

/** 一下按键：曲子的第几毫秒按下、按的哪个键（KeyboardEvent.code）、第几毫秒松开（长按看它；没松开就停了的没有） */
export interface KeyPress { ms: number; code: string; upMs?: number }

export const keyName = (code: string): string => code.replace(/^Key/, '').replace(/^Arrow/, '').replace('Space', '␣');
