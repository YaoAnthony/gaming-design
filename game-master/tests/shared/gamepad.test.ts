import { describe, expect, it } from 'vitest';
import { anyPressed, GAMEPAD_BUTTONS, GAMEPAD_DPAD, MENU_REPEAT, menuRepeat, padAction, padDirs, padKind, readNativePads, STICK_DEADZONE, type RepeatState } from '@/shared/gamepad';
import { wrapIndex } from '@/ui/menu/useMenuNav';

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

  it('菜单：A 或 Start 选中，B 或 Back 返回', () => {
    expect(GAMEPAD_BUTTONS.confirm).toEqual([0, 9]);
    expect(GAMEPAD_BUTTONS.back).toEqual([1, 8]);
  });

  it('游戏里的按钮和菜单的「返回」不冲突：B 在游戏里什么都不做', () => {
    expect(padAction(GAMEPAD_BUTTONS.back[0])).toBeNull();
  });
});

describe('菜单的方向连发', () => {
  const idle: RepeatState = { dir: 0, since: 0, last: 0 };
  /** 从 0 毫秒起按住 dir，每 16 毫秒一帧，到 until 为止一共走了几格 */
  const holdFor = (dir: -1 | 1, until: number) => {
    let s = idle, steps = 0;
    for (let t = 0; t <= until; t += 16) { const r = menuRepeat(s, dir, t); s = r.state; steps += Math.abs(r.step); }
    return steps;
  };

  it('按下走一格；没到连发的时间不再走', () => {
    expect(menuRepeat(idle, 1, 0).step).toBe(1);
    expect(holdFor(1, MENU_REPEAT.delay - 20)).toBe(1);
  });

  it('按住超过 delay 之后每 every 毫秒走一格', () => {
    const t = MENU_REPEAT.delay + MENU_REPEAT.every * 3 + 5;
    expect(holdFor(-1, t)).toBeGreaterThanOrEqual(4);
    expect(holdFor(-1, t)).toBeLessThanOrEqual(5);
  });

  it('松开再按、换方向：马上走一格', () => {
    let r = menuRepeat(idle, 1, 0);
    r = menuRepeat(r.state, 0, 50);
    expect(menuRepeat(r.state, 1, 60).step).toBe(1);
    expect(menuRepeat(menuRepeat(idle, 1, 0).state, -1, 30).step).toBe(-1);
  });

  it('换项首尾相接', () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(0, 1, 0)).toBe(0);
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

describe('直接读浏览器的手柄', () => {
  const pad = (axes: number[], pressed: number[] = []) => ({ axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) });

  it('左摇杆和十字键合成方向；空位（没插的手柄）跳过', () => {
    expect(readNativePads([null, pad([1, 0])])).toEqual({ ...NONE, right: true });
    expect(readNativePads([pad([0, 0], [GAMEPAD_DPAD.up, GAMEPAD_DPAD.left])])).toEqual({ ...NONE, up: true, left: true });
  });

  it('几个手柄任何一个往那边推都算；都没动就是不动', () => {
    expect(readNativePads([pad([-1, 0]), pad([0, 1])])).toEqual({ ...NONE, left: true, down: true });
    expect(readNativePads([pad([0, 0]), null])).toEqual(NONE);
    expect(readNativePads([])).toEqual(NONE);
  });
});
