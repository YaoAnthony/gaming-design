import { describe, expect, it } from 'vitest';
import { anyPressed, GAMEPAD_BUTTONS, padAction, padDirs, padKind, STICK_DEADZONE } from './gamepad';

const NONE = { left: false, right: false, up: false, down: false };

describe('手柄按钮', () => {
  it('A 跳、Y 重置、Back 退出试玩', () => {
    expect(padAction(0)).toBe('jump');
    expect(padAction(3)).toBe('reset');
    expect(padAction(8)).toBe('exit');
  });

  it('没用上的按钮（B、X、十字键……）什么都不做', () => {
    for (const b of [1, 2, 4, 5, 6, 7, 12, 13, 14, 15]) expect(padAction(b)).toBeNull();
  });

  it('标题画面 A 或 Start 开始', () => {
    expect(GAMEPAD_BUTTONS.start).toEqual([0, 9]);
  });
});

describe('摇杆和十字键', () => {
  it('摇杆在死区里不算', () => {
    const s = STICK_DEADZONE * 0.9;
    expect(padDirs({ x: s, y: -s }, NONE)).toEqual(NONE);
  });

  it('摇杆推过死区：往哪边推就是哪边，斜着推两个方向都算', () => {
    expect(padDirs({ x: -1, y: 0 }, NONE)).toEqual({ ...NONE, left: true });
    expect(padDirs({ x: 0.8, y: 0.8 }, NONE)).toEqual({ ...NONE, right: true, down: true });
  });

  it('十字键和摇杆合在一起', () => {
    expect(padDirs({ x: 1, y: 0 }, { ...NONE, up: true })).toEqual({ ...NONE, right: true, up: true });
  });
});

describe('认手柄', () => {
  it('PlayStation 手柄（各浏览器给的名字不一样）', () => {
    expect(padKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps');
    expect(padKind('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('ps');
    expect(padKind('054c-0ce6-DualSense Wireless Controller')).toBe('ps');
    expect(padKind('DUALSHOCK 4 Wireless Controller')).toBe('ps');
  });

  it('Xbox 和认不出的都当 Xbox 式', () => {
    expect(padKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(padKind('Some Generic USB Gamepad')).toBe('xbox');
  });
});

describe('标题画面查按钮', () => {
  const pad = (...pressed: number[]) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) });

  it('任何一个手柄按着其中一个按钮就算', () => {
    expect(anyPressed([null, pad(9)], [0, 9])).toBe(true);
    expect(anyPressed([pad(1), pad()], [0, 9])).toBe(false);
  });

  it('没有手柄', () => {
    expect(anyPressed([], [0])).toBe(false);
    expect(anyPressed([null, null], [0])).toBe(false);
  });
});
