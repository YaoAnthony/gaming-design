// ===== 触屏输入（手机端虚拟按键 → Phaser）=====
// React 按钮改这里的状态，游戏场景每帧读；跳跃是一次性事件，走 bridge
export const touch = { left: false, right: false, up: false, down: false };
export const TOUCH_JUMP = 'input:jump';
/** 俯视层的动作键（炸弹） */
export const TOUCH_ACTION = 'input:action';

/** 触屏设备：手机、平板。三种判断取并集，任何一个成立就算 */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
