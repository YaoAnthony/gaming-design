// ===== 触屏输入（手机端虚拟按键 → Phaser）=====
// React 按钮改这里的状态，游戏场景每帧读；跳跃是一次性事件，走 bridge
export const touch = { left: false, right: false };
export const TOUCH_JUMP = 'input:jump';

/** 粗指针（手指）设备：手机、平板 */
export const isTouchDevice = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
