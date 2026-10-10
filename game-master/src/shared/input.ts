// ===== 输入：触屏虚拟按键的状态、几种输入共用的事件（手柄映射在 gamepad.ts）=====
// React 按钮改这里的状态，游戏场景每帧读；跳跃是一次性事件，走 bridge
/** 上下左右哪几个按着（键盘、手柄、触屏合起来）：2D 机制和 3D 世界都用 */
export interface MoveInput {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** 抓键按着（键盘 Shift / E、手柄 X / □）：贴着箱子按住，往反方向走就拉。只有 2D 游戏里读 */
  grab?: boolean;
}

export const touch: MoveInput = { left: false, right: false, up: false, down: false };
export const TOUCH_JUMP = 'input:jump';
/** 俯视层的动作键（炸弹） */
export const TOUCH_ACTION = 'input:action';
/** 往下按了一下（键盘 ↓ / S、手柄、触屏都算）：GameScene 在场景事件上发，帽子听它摘下来 */
export const INPUT_DOWN = 'input:down';

/** 触屏设备：手机、平板。三种判断取并集，任何一个成立就算 */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
