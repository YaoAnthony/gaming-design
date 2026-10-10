// ===== 手柄（Phaser 这一侧）：从 Phaser 的手柄插件读方向。按键映射、浏览器原生手柄的读法在 shared/gamepad.ts（3D 世界也用）=====
import type Phaser from 'phaser';
import type { MoveInput } from '@/shared/input';
import { GAMEPAD_BUTTONS, padDirs } from '@/shared/gamepad';

export * from '@/shared/gamepad';

/** 所有连着的手柄合在一起的上下左右（任何一个往那边推都算），再加上抓键按没按着 */
export function readPads(plugin: Phaser.Input.Gamepad.GamepadPlugin | null | undefined): MoveInput {
  const out: MoveInput = { left: false, right: false, up: false, down: false, grab: false };
  plugin?.getAll().forEach(p => {
    const d = padDirs(p.leftStick, { left: p.left, right: p.right, up: p.up, down: p.down });
    out.left ||= d.left; out.right ||= d.right; out.up ||= d.up; out.down ||= d.down;
    out.grab ||= GAMEPAD_BUTTONS.grab.some(i => !!p.buttons[i]?.pressed);
  });
  return out;
}
