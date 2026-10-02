// ===== 3D 世界的按键：键盘、手柄、触屏三路合成一套动作 =====
// 手柄直接读浏览器的（2D 那边走 Phaser 的插件，这里不能用），按钮映射和 2D 是同一张表（game/gamepad.ts）
import { bridge } from '@/protocol';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/game/input';
import { anyPressed, GAMEPAD_BUTTONS, readNativePads } from '@/game/gamepad';

/** 键盘上哪些键算哪个动作（KeyboardEvent.code） */
const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space'],
} as const;
type Action = keyof typeof KEYS;

const ACTION_OF = new Map<string, Action>((Object.keys(KEYS) as Action[]).flatMap(a => KEYS[a].map(code => [code, a] as const)));

export interface WorldMove {
  /** 左右（-1..1，右为正）、前后（-1..1，朝画面外、也就是朝镜头为正） */
  x: number;
  z: number;
  /** 这一帧按下了跳 */
  jump: boolean;
  /** 这一帧刚按下的方向（按着不放只算一次）：节奏玩法用 */
  press: { left: boolean; right: boolean; up: boolean; down: boolean };
}

export class WorldInput {
  private readonly held = new Set<Action>();
  private jumpQueued = false;
  /** 上一帧手柄的跳是不是按着：只在按下的那一刻算一次。一开始当按着，免得从 2D 带过来的那一下也算 */
  private padJumpHeld = true;
  /** 上一帧四个方向是不是按着（手柄、触屏靠它认出「刚按下」） */
  private wasDown = { left: false, right: false, up: false, down: false };
  /** 键盘上刚按下、还没被读走的方向：按得再快（一帧之内按下又松开）也不漏 */
  private readonly tapped = new Set<Action>();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
    bridge.on(TOUCH_JUMP, this.onTouchJump); bridge.on(TOUCH_ACTION, this.onTouchJump);
  }

  /** 读这一帧的动作（跳是一次性的，读了就清） */
  read(): WorldMove {
    const pads = navigator.getGamepads?.() ?? [], pad = readNativePads(pads);
    const padJump = anyPressed(pads, GAMEPAD_BUTTONS.jump);
    if (padJump && !this.padJumpHeld) this.jumpQueued = true;
    this.padJumpHeld = padJump;
    const down = {
      left: this.held.has('left') || touch.left || pad.left, right: this.held.has('right') || touch.right || pad.right,
      up: this.held.has('up') || touch.up || pad.up, down: this.held.has('down') || touch.down || pad.down,
    };
    const was = this.wasDown;
    const move = {
      x: +down.right - +down.left,
      z: +down.down - +down.up,
      jump: this.jumpQueued,
      press: {
        left: (down.left && !was.left) || this.tapped.has('left'), right: (down.right && !was.right) || this.tapped.has('right'),
        up: (down.up && !was.up) || this.tapped.has('up'), down: (down.down && !was.down) || this.tapped.has('down'),
      },
    };
    this.wasDown = down; this.tapped.clear();
    this.jumpQueued = false;
    return move;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    bridge.off(TOUCH_JUMP, this.onTouchJump); bridge.off(TOUCH_ACTION, this.onTouchJump);
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    const a = ACTION_OF.get(e.code);
    if (!a) return;
    if (a === 'jump' && !e.repeat) this.jumpQueued = true;
    if (!e.repeat) this.tapped.add(a);
    this.held.add(a);
  };
  private readonly onUp = (e: KeyboardEvent): void => { const a = ACTION_OF.get(e.code); if (a) this.held.delete(a); };
  private readonly onBlur = (): void => { this.held.clear(); };
  private readonly onTouchJump = (): void => { this.jumpQueued = true; };
}
