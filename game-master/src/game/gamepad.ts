// ===== 手柄：标准布局（Xbox、PS 按钮位置一样）的默认映射 =====
// 浏览器要等页面打开后按一下手柄上的键才认得出手柄。按钮编号是浏览器 Gamepad API 的标准布局：
// 0 = A / ✕，1 = B / ○，2 = X / □，3 = Y / △，8 = Back / Select，9 = Start，12~15 = 十字键上下左右。
// 左摇杆、十字键 = 方向键；游戏里的按钮在 GameScene.bindInput 接，标题画面在 TitleScreen 自己查。
import type Phaser from 'phaser';
import type { MoveInput } from '@/game/mechanics/define';

/** 按钮 → 动作。改键就改这张表 */
export const GAMEPAD_BUTTONS = {
  /** 跳（起跳爆炸）、推进对话、吃豆人层放炸弹：和空格一样 */
  jump: [0],
  /** 重置房间：和 R 一样 */
  reset: [3],
  /** 编辑器试玩时退出：和 ESC 一样 */
  exit: [8],
  /** 标题画面开始游戏 */
  start: [0, 9],
} as const satisfies Record<string, readonly number[]>;

/** 游戏里按钮能做的事 */
export type PadAction = 'jump' | 'reset' | 'exit';
const PAD_ACTIONS: readonly PadAction[] = ['jump', 'reset', 'exit'];

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

/** 所有连着的手柄合在一起的上下左右（任何一个往那边推都算） */
export function readPads(plugin: Phaser.Input.Gamepad.GamepadPlugin | null | undefined): MoveInput {
  const out: MoveInput = { left: false, right: false, up: false, down: false };
  plugin?.getAll().forEach(p => {
    const d = padDirs(p.leftStick, { left: p.left, right: p.right, up: p.up, down: p.down });
    out.left ||= d.left; out.right ||= d.right; out.up ||= d.up; out.down ||= d.down;
  });
  return out;
}

/** 手柄长什么样：PS（按钮是 ✕○□△）和其他（Xbox 式的 A B X Y） */
export type PadKind = 'xbox' | 'ps';

/** 按浏览器给的手柄名字认是不是 PlayStation（Sony 的厂商号 054c，或者名字里带 DualSense / DualShock / PlayStation）；认不出的都当 Xbox 式 */
export function padKind(id: string): PadKind {
  return /054c|dualsense|dualshock|playstation/i.test(id) ? 'ps' : 'xbox';
}

/** 这些手柄里有没有哪个正按着这几个按钮之一（标题画面直接查 navigator.getGamepads()） */
export function anyPressed(pads: ArrayLike<{ buttons: ArrayLike<{ pressed: boolean }> } | null>, buttons: readonly number[]): boolean {
  return Array.from(pads).some(p => !!p && buttons.some(i => !!p.buttons[i]?.pressed));
}
