// ===== 手柄：标准布局（Xbox、PS 按钮位置一样）的默认映射 =====
// 浏览器要等页面打开后按一下手柄上的键才认得出手柄。按钮编号是浏览器 Gamepad API 的标准布局：
// 0 = A / ✕，1 = B / ○，2 = X / □，3 = Y / △，8 = Back / Select，9 = Start，12~15 = 十字键上下左右。
// 左摇杆、十字键 = 方向键。游戏里的按钮在 game/core/GameInput 接；菜单（标题、设置、结局画面）在 ui/menu/useMenuNav 直接查浏览器的手柄。
// 完整的键位表见 docs/controls.md。
import type { MoveInput } from './input';

/** 按钮 → 动作。改键就改这张表 */
export const GAMEPAD_BUTTONS = {
  /** 跳（起跳爆炸）、推进对话、吃豆人层放炸弹：和空格一样 */
  jump: [0],
  /** 重置房间：和 R 一样 */
  reset: [3],
  /** 抓箱子（按住）：和 Shift / E 一样。按住的键不走按钮事件，GameInput.read 每帧读 */
  grab: [2],
  /** 编辑器试玩时退出：和 ESC 一样 */
  exit: [8],
  /** 游戏里暂停（开暂停菜单）：和 ESC 一样 */
  pause: [9],
  /** 菜单：选中（A / ✕，或 Start）——标题、设置、结局画面 */
  confirm: [0, 9],
  /** 菜单：返回（B / ○，或 Back / Select）——设置里退回上一层、关掉确认框 */
  back: [1, 8],
} as const satisfies Record<string, readonly number[]>;

/** 十字键的按钮编号（标准布局） */
export const GAMEPAD_DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;

/** 游戏里按钮能做的事 */
export type PadAction = 'jump' | 'reset' | 'exit' | 'pause';
const PAD_ACTIONS: readonly PadAction[] = ['jump', 'reset', 'exit', 'pause'];

/** 摇杆推过这么多（0..1）才算往那边 */
export const STICK_DEADZONE = 0.4;

/** 游戏里按下这个按钮做什么；没用上的按钮返回 null */
export function padAction(button: number): PadAction | null {
  return PAD_ACTIONS.find(a => (GAMEPAD_BUTTONS[a] as readonly number[]).includes(button)) ?? null;
}

/** 左摇杆（x、y 在 -1..1，往下是正）和十字键合成上下左右 */
export function padDirs(stick: { x: number; y: number }, dpad: MoveInput): MoveInput {
  return {
    left: dpad.left || stick.x < -STICK_DEADZONE,
    right: dpad.right || stick.x > STICK_DEADZONE,
    up: dpad.up || stick.y < -STICK_DEADZONE,
    down: dpad.down || stick.y > STICK_DEADZONE,
  };
}

/** 浏览器给的一个手柄里用得上的部分（navigator.getGamepads() 的元素） */
export interface NativePad { axes: ArrayLike<number>; buttons: ArrayLike<{ pressed: boolean }> }

/** 直接读浏览器的手柄（不经过 Phaser）：3D 世界用；Phaser 那边的是 game/gamepad.ts 的 readPads */
export function readNativePads(pads: ArrayLike<NativePad | null>): MoveInput {
  const out: MoveInput = { left: false, right: false, up: false, down: false };
  for (const p of Array.from(pads)) {
    if (!p) continue;
    const on = (i: number) => !!p.buttons[i]?.pressed;
    const d = padDirs({ x: p.axes[0] ?? 0, y: p.axes[1] ?? 0 }, { left: on(GAMEPAD_DPAD.left), right: on(GAMEPAD_DPAD.right), up: on(GAMEPAD_DPAD.up), down: on(GAMEPAD_DPAD.down) });
    out.left ||= d.left; out.right ||= d.right; out.up ||= d.up; out.down ||= d.down;
  }
  return out;
}

/** 手柄长什么样：PS（按钮是 ✕○□△）和其他（Xbox 式的 A B X Y） */
export type PadKind = 'xbox' | 'ps';

/** 按浏览器给的手柄名字认是不是 PlayStation（Sony 的厂商号 054c，或者名字里带 DualSense / DualShock / PlayStation）；认不出的都当 Xbox 式 */
export function padKind(id: string): PadKind {
  return /054c|dualsense|dualshock|playstation/i.test(id) ? 'ps' : 'xbox';
}

/**
 * 菜单里按住方向键的连发：刚按下走一格，按住超过 delay 之后每 every 毫秒再走一格。
 * 纯函数（每帧给它这一帧的方向和时间，返回这一帧要不要走、往哪走），手柄和测试都用它
 */
export interface RepeatState { dir: -1 | 0 | 1; since: number; last: number }
export const MENU_REPEAT = { delay: 380, every: 110 };
export function menuRepeat(state: RepeatState, dir: -1 | 0 | 1, now: number): { state: RepeatState; step: -1 | 0 | 1 } {
  if (dir === 0) return { state: { dir: 0, since: now, last: now }, step: 0 };
  if (dir !== state.dir) return { state: { dir, since: now, last: now }, step: dir };
  if (now - state.since >= MENU_REPEAT.delay && now - state.last >= MENU_REPEAT.every) return { state: { ...state, last: now }, step: dir };
  return { state, step: 0 };
}

/** 这些手柄里有没有哪个正按着这几个按钮之一（菜单直接查 navigator.getGamepads()） */
export function anyPressed(pads: ArrayLike<{ buttons: ArrayLike<{ pressed: boolean }> } | null>, buttons: readonly number[]): boolean {
  return Array.from(pads).some(p => !!p && buttons.some(i => !!p.buttons[i]?.pressed));
}
