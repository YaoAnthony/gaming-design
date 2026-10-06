// ===== 菜单的按键：键盘、手柄、鼠标、触屏一套（标题菜单、设置、结局画面都用它）=====
// 键盘：↑↓ / W S 换项，← → / A D 调值（音量、语言），回车 / 空格选中，Esc / Backspace 返回。
// 手柄：十字键 / 左摇杆换项和调值（按住连发），A / Start 选中，B / Back 返回（键位表在 shared/gamepad.ts）。
// 鼠标移上去 = 选中那一项，点一下 = 选中并确定；触屏点一下同样。
// 刚挂上的时候正按着的键（比如上一个菜单按下的那一下）要先松开，免得一下子连着选两层。
import { useEffect, useRef } from 'react';
import { anyPressed, GAMEPAD_BUTTONS, GAMEPAD_DPAD, menuRepeat, padKind, STICK_DEADZONE, type RepeatState } from '@/shared/gamepad';
import { noteDevice } from '@/game/inputDevice';

export interface MenuNav {
  count: number;
  index: number;
  setIndex(i: number): void;
  /** 选中第 i 项（回车、A、点击） */
  onPick(i: number): void;
  /** 返回（Esc、B）；不给 = 这一层没有返回 */
  onBack?(): void;
  /** 在第 i 项上按 ← →（调音量、换语言）；不给 = 左右也是换项 */
  onAdjust?(i: number, dir: -1 | 1): void;
  /** false = 先不听（比如还在演开场） */
  enabled?: boolean;
}

const KEY_UP = ['ArrowUp', 'KeyW'], KEY_DOWN = ['ArrowDown', 'KeyS'], KEY_LEFT = ['ArrowLeft', 'KeyA'], KEY_RIGHT = ['ArrowRight', 'KeyD'];
const KEY_PICK = ['Enter', 'Space', 'NumpadEnter'], KEY_BACK = ['Escape', 'Backspace'];

/** 键盘 / 手柄换了几格之后的下标（首尾相接） */
export const wrapIndex = (i: number, step: number, count: number): number => (count <= 0 ? 0 : (((i + step) % count) + count) % count);

export function useMenuNav(nav: MenuNav): void {
  const ref = useRef(nav);
  ref.current = nav;
  const enabled = nav.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const move = (step: number) => { const n = ref.current; if (n.count) n.setIndex(wrapIndex(n.index, step, n.count)); };
    const adjust = (dir: -1 | 1) => { const n = ref.current; if (n.onAdjust) n.onAdjust(n.index, dir); else move(dir); };
    const onKey = (e: KeyboardEvent) => {
      const c = e.code;
      if (KEY_UP.includes(c)) move(-1);
      else if (KEY_DOWN.includes(c)) move(1);
      else if (KEY_LEFT.includes(c)) adjust(-1);
      else if (KEY_RIGHT.includes(c)) adjust(1);
      else if (KEY_PICK.includes(c)) { if (e.repeat) return; ref.current.onPick(ref.current.index); }
      else if (KEY_BACK.includes(c)) { if (e.repeat || !ref.current.onBack) return; ref.current.onBack(); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey);

    // 手柄：每帧查一次。上下（换项）和左右（调值）各自连发；A / B 只认按下的那一刻
    let raf = 0, vert: RepeatState = { dir: 0, since: 0, last: 0 }, horz: RepeatState = { dir: 0, since: 0, last: 0 };
    let held = true;   // 刚挂上时当作按着：全部松开之后才认
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const pads = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
      if (!pads.length) { held = false; return; }   // 没有手柄：也就没有正按着的键
      const on = (i: number) => pads.some(p => !!p.buttons[i]?.pressed);
      const ax = (i: number) => pads.reduce((v, p) => (Math.abs(p.axes[i] ?? 0) > Math.abs(v) ? p.axes[i] ?? 0 : v), 0);
      const y = on(GAMEPAD_DPAD.up) || ax(1) < -STICK_DEADZONE ? -1 : on(GAMEPAD_DPAD.down) || ax(1) > STICK_DEADZONE ? 1 : 0;
      const x = on(GAMEPAD_DPAD.left) || ax(0) < -STICK_DEADZONE ? -1 : on(GAMEPAD_DPAD.right) || ax(0) > STICK_DEADZONE ? 1 : 0;
      const pick = anyPressed(pads, GAMEPAD_BUTTONS.confirm), back = anyPressed(pads, GAMEPAD_BUTTONS.back);
      if (held) { if (!pick && !back && !x && !y) held = false; else return; }
      const v = menuRepeat(vert, y, now); vert = v.state;
      const h = menuRepeat(horz, x, now); horz = h.state;
      if (v.step || h.step || pick || back) noteDevice(padKind(pads[0].id));
      if (v.step) move(v.step);
      if (h.step) adjust(h.step);
      if (pick || back) {
        held = true;   // 松开再认下一下
        if (pick) ref.current.onPick(ref.current.index);
        else ref.current.onBack?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
  }, [enabled]);
}
