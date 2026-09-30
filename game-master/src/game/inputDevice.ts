// ===== 全局盯着玩家在用键盘还是手柄，记到 store.input.device：提示文字按它显示 =====
// 键盘：任何按键按下就算。手柄：定时查，有按钮按下或摇杆推过死区就算（浏览器要按过一下才认得出手柄，正好）。
// 只在换了设备时派发一次
import { store } from '@/redux/store';
import { setDevice, type InputDevice } from '@/redux/slices/inputSlice';
import { padKind, STICK_DEADZONE } from './gamepad';

const POLL_MS = 100;

/** 记下玩家刚用了这个设备（换了才派发）。标题页看到手柄按下时也直接调它，不等下一次轮询 */
export function noteDevice(device: InputDevice): void {
  if (store.getState().input.device !== device) store.dispatch(setDevice(device));
}

/** 手柄有没有在被操作：任何按钮按着、或任何摇杆推过死区 */
function padInUse(p: Gamepad): boolean {
  return Array.from(p.buttons).some(b => b.pressed) || Array.from(p.axes).some(a => Math.abs(a) > STICK_DEADZONE);
}

export function watchInputDevice(): void {
  window.addEventListener('keydown', () => noteDevice('keyboard'), { capture: true });
  window.setInterval(() => {
    const pads = navigator.getGamepads?.() ?? [];
    const active = Array.from(pads).find(p => !!p && padInUse(p));
    if (active) noteDevice(padKind(active.id));
  }, POLL_MS);
}
