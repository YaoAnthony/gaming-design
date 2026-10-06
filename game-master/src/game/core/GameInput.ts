// ===== 游戏里的按键：键盘、手柄、触屏三路合成一套动作，场景只收动作 =====
// 方向每帧读（read）；一次性的按钮（跳、重置、退出试玩）和 React 发来的请求（重置、继续、再来一次、下一关、攥纸团）走 handlers
import Phaser from 'phaser';
import type { MoveInput } from '@/game/mechanics/define';
import { bridge, EVT, type CrumpleDone, type HeroEntryQuery, type RhythmStart, type ScreenSpot } from '@/protocol';
import { INPUT_DOWN, touch, TOUCH_ACTION, TOUCH_JUMP } from '@/shared/input';
import { padAction, readPads } from '@/game/gamepad';

export type PressKey = 'SPACE' | 'UP' | 'W' | 'touch';

export interface InputHandlers {
  /** 跳 / 动作键（空格、↑、W、手柄 A、触屏） */
  press(key: PressKey): void;
  /** R / 手柄 Y */
  reset(): void;
  continueGame(): void;
  restartRun(): void;
  nextLevel(): void;
  /** ESC / 手柄 Back / 编辑器按钮；只在试玩时挂 ESC */
  exitPlaytest(): void;
  crumpleFreeze(): void;
  crumpleDone(d: CrumpleDone): void;
  /** 让主角跳出画面 / 主角要从这里走回画面，能落在哪 / 主角走回画面了 */
  popOut(): void;
  heroEntry(q: HeroEntryQuery): void;
  heroReturn(at: ScreenSpot | null): void;
  /** 开一场节奏关卡 / 中途退出 */
  rhythmStart(r: RhythmStart): void;
  rhythmStop(): void;
}

export class GameInput {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keys: Record<'A' | 'D' | 'W' | 'S', Phaser.Input.Keyboard.Key>;
  /** 上一帧「下」是不是按着：只在按下的那一刻发 INPUT_DOWN */
  private downHeld = false;

  constructor(private readonly scene: Phaser.Scene, h: InputHandlers, playtest: boolean) {
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D', W: 'W', S: 'S' }) as GameInput['keys'];
    kb.on('keydown-SPACE', () => h.press('SPACE'));
    kb.on('keydown-UP', () => h.press('UP'));
    kb.on('keydown-W', () => h.press('W'));
    kb.on('keydown-R', h.reset);
    if (playtest) kb.on('keydown-ESC', h.exitPlaytest);
    const touchPress = () => h.press('touch');
    bridge.on(TOUCH_JUMP, touchPress); bridge.on(TOUCH_ACTION, touchPress);
    bridge.on(EVT.requestReset, h.reset); bridge.on(EVT.continueGame, h.continueGame); bridge.on(EVT.restartGame, h.restartRun); bridge.on(EVT.nextLevel, h.nextLevel);
    bridge.on(EVT.requestPlaytestExit, h.exitPlaytest);
    bridge.on(EVT.crumpleFreeze, h.crumpleFreeze); bridge.on(EVT.crumpleDone, h.crumpleDone);
    bridge.on(EVT.heroPopOut, h.popOut); bridge.on(EVT.heroEntry, h.heroEntry); bridge.on(EVT.heroReturn, h.heroReturn);
    bridge.on(EVT.rhythmStart, h.rhythmStart); bridge.on(EVT.rhythmStop, h.rhythmStop);
    // 手柄按钮：和对应的键盘键做同样的事（映射表在 game/gamepad.ts）；方向在 read 里读
    const onPad = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      const action = padAction(button.index);
      if (action === 'jump') h.press('SPACE');
      else if (action === 'reset') h.reset();
      else if (action === 'exit') h.exitPlaytest();
    };
    scene.input.gamepad?.on(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onPad);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.gamepad?.off(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onPad);
      bridge.off(TOUCH_JUMP, touchPress); bridge.off(TOUCH_ACTION, touchPress);
      bridge.off(EVT.requestReset, h.reset); bridge.off(EVT.continueGame, h.continueGame); bridge.off(EVT.restartGame, h.restartRun); bridge.off(EVT.nextLevel, h.nextLevel);
      bridge.off(EVT.requestPlaytestExit, h.exitPlaytest);
      bridge.off(EVT.crumpleFreeze, h.crumpleFreeze); bridge.off(EVT.crumpleDone, h.crumpleDone);
      bridge.off(EVT.heroPopOut, h.popOut); bridge.off(EVT.heroEntry, h.heroEntry); bridge.off(EVT.heroReturn, h.heroReturn);
      bridge.off(EVT.rhythmStart, h.rhythmStart); bridge.off(EVT.rhythmStop, h.rhythmStop);
      touch.left = false; touch.right = false; touch.up = false; touch.down = false;
    });
  }

  /** 上下左右：键盘（方向键、WASD）、触屏、手柄（左摇杆、十字键）任何一个按着都算 */
  read(): MoveInput {
    const c = this.cursors, k = this.keys, pad = readPads(this.scene.input.gamepad);
    return {
      left: c.left.isDown || k.A.isDown || touch.left || pad.left,
      right: c.right.isDown || k.D.isDown || touch.right || pad.right,
      up: c.up.isDown || k.W.isDown || touch.up || pad.up,
      down: c.down.isDown || k.S.isDown || touch.down || pad.down,
    };
  }

  /** 往下按了一下（摘帽子、放钥匙）：只在按下的那一刻在场景事件上发 INPUT_DOWN */
  pollDown(input: MoveInput): void {
    if (input.down && !this.downHeld) this.scene.events.emit(INPUT_DOWN);
    this.downHeld = input.down;
  }
}
