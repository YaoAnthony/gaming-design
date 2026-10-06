// ===== 3D 世界的按键：键盘、手柄、触屏三路合成一套动作 =====
// 手柄直接读浏览器的（2D 那边走 Phaser 的插件，这里不能用），按钮映射和 2D 是同一张表（game/gamepad.ts）
import { bridge } from '@/protocol';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/shared/input';
import { anyPressed, GAMEPAD_BUTTONS, readNativePads } from '@/shared/gamepad';
import { LANE_ARROWS, LANE_KEYS } from '@/rhythm';

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
  /** 这一帧刚按下的方向（按着不放只算一次）、四条道（从左到右 Q W E R；方向键、手柄、触屏的 ← ↑ ↓ → 也算）：节奏玩法用 */
  press: { left: boolean; right: boolean; up: boolean; down: boolean; lanes: boolean[] };
  /** 四条道的键现在按没按着（长按用） */
  lanesHeld: boolean[];
}

export class WorldInput {
  private readonly held = new Set<Action>();
  private jumpQueued = false;
  /** 上一帧手柄的跳是不是按着：只在按下的那一刻算一次。一开始当按着，免得从 2D 带过来的那一下也算 */
  private padJumpHeld = true;
  /** 上一帧四个方向是不是按着（手柄、触屏靠它认出「刚按下」） */
  private wasDown = { left: false, right: false, up: false, down: false };
  /** 键盘上刚按下、还没被读走的方向 / 键（KeyboardEvent.code）：按得再快（一帧之内按下又松开）也不漏 */
  private readonly tapped = new Set<Action>();
  private readonly tappedCodes = new Set<string>();
  /** 键盘上现在按着的键（KeyboardEvent.code） */
  private readonly heldCodes = new Set<string>();
  /** 上一帧手柄、触屏四个方向是不是按着 */
  private wasRemote = [false, false, false, false];

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
    const remote = [touch.left || pad.left, touch.up || pad.up, touch.down || pad.down, touch.right || pad.right];
    const move = {
      x: +down.right - +down.left,
      z: +down.down - +down.up,
      jump: this.jumpQueued,
      press: {
        left: (down.left && !was.left) || this.tapped.has('left'), right: (down.right && !was.right) || this.tapped.has('right'),
        up: (down.up && !was.up) || this.tapped.has('up'), down: (down.down && !was.down) || this.tapped.has('down'),
        // 四条道：Q W E R、方向键，或者手柄 / 触屏的方向（键盘上的 A S D 不算：它们不在一排上）
        lanes: remote.map((on, i) => this.tappedCodes.has(LANE_KEYS[i].code) || this.tappedCodes.has(LANE_ARROWS[i]) || (on && !this.wasRemote[i])),
      },
      lanesHeld: remote.map((on, i) => on || this.heldCodes.has(LANE_KEYS[i].code) || this.heldCodes.has(LANE_ARROWS[i])),
    };
    this.wasDown = down; this.wasRemote = remote; this.tapped.clear(); this.tappedCodes.clear();
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
    if (!e.repeat) this.tappedCodes.add(e.code);
    this.heldCodes.add(e.code);
    const a = ACTION_OF.get(e.code);
    if (!a) return;
    if (a === 'jump' && !e.repeat) this.jumpQueued = true;
    if (!e.repeat) this.tapped.add(a);
    this.held.add(a);
  };
  private readonly onUp = (e: KeyboardEvent): void => { this.heldCodes.delete(e.code); const a = ACTION_OF.get(e.code); if (a) this.held.delete(a); };
  private readonly onBlur = (): void => { this.held.clear(); this.tappedCodes.clear(); this.heldCodes.clear(); };
  private readonly onTouchJump = (): void => { this.jumpQueued = true; };
}
