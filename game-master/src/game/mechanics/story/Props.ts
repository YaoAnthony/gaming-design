// ===== 施工区的道具：施工牌、线框格（还没画上砖的格子）、一堆堆素材、散落的菜单按钮 =====
// 都不挡人；菜单按钮踩上去会按下去，「嗒」一声，飘一句话。
import Phaser from 'phaser';
import type { Point } from '@/type';
import type { PlayContext } from '@/game/core/PlayContext';
import type { MsgKey } from '@/i18n/keys';
import { tr } from '@/i18n';
import { openBus, tone } from '@/audio/synth';
import { DEPTH } from '@/game/depth';
import { Colors, hex } from '@/shared/palette';

/** 散落的菜单按钮按出现的顺序轮着是这几个 */
const BUTTONS = ['start', 'settings', 'quit'] as const;
const PRESS_MSG: Record<typeof BUTTONS[number], MsgKey> = { start: 'msg.pressStart', settings: 'msg.pressSettings', quit: 'msg.pressQuit' };
/** 按钮的宽（像素）：人的中心在这个范围里、脚踩在按钮上算按下 */
const BUTTON_W = 64;

interface MenuButton { kind: typeof BUTTONS[number]; sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; down: boolean; x: number; top: number }

export class Props {
  private buttons: MenuButton[] = [];

  constructor(private readonly ctx: PlayContext) {}

  sign(at: Point): void {
    const s = this.ctx.scene, T = this.ctx.cfg.tile, bottom = at.y + T / 2;
    s.add.image(at.x, bottom, 'story_sign').setOrigin(0.5, 1).setDepth(DEPTH.storyProp);
    s.add.text(at.x, bottom - 29, tr('story.sign'), { fontSize: '9px', fontStyle: 'bold', color: '#1a1a1a', fontFamily: 'sans-serif' }).setOrigin(0.5).setDepth(DEPTH.storyProp + 0.01).setResolution(3);
  }

  /** 线框格：一闪一闪的虚线框 */
  wire(at: Point): void {
    const img = this.ctx.scene.add.image(at.x, at.y, 'story_wire').setDepth(DEPTH.storyProp).setAlpha(0.5);
    this.ctx.scene.tweens.add({ targets: img, alpha: 0.2, duration: 900 + ((at.x * 7 + at.y * 13) % 500), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  /** 一堆素材：按位置定一个歪的角度、翻不翻，每次进层一样 */
  pile(at: Point): void {
    const T = this.ctx.cfg.tile, h = (at.x * 31 + at.y * 17) % 7;
    this.ctx.scene.add.image(at.x, at.y + T / 2, 'story_pile').setOrigin(0.5, 1).setDepth(DEPTH.storyProp).setFlipX(h % 2 === 0).setAngle(h - 3);
  }

  button(at: Point): void {
    const s = this.ctx.scene, T = this.ctx.cfg.tile, kind = BUTTONS[this.buttons.length % BUTTONS.length];
    const top = at.y + T / 2 - 16;
    const sprite = s.add.sprite(at.x, at.y + T / 2, 'story_button', 0).setOrigin(0.5, 1).setDepth(DEPTH.storyProp);
    const label = s.add.text(at.x, top + 3, tr(`story.button.${kind}`), { fontSize: '10px', fontStyle: 'bold', color: '#e8ecff', fontFamily: 'sans-serif' }).setOrigin(0.5).setDepth(DEPTH.storyProp + 0.01).setResolution(3);
    this.buttons.push({ kind, sprite, label, down: false, x: at.x, top });
  }

  /** 踩上去按下（松开弹回来） */
  updateAlive(): void {
    if (!this.buttons.length) return;
    const b = this.ctx.player.body;
    for (const btn of this.buttons) {
      const on = Math.abs(b.center.x - btn.x) < BUTTON_W / 2 && b.bottom >= btn.top - 2 && b.bottom <= btn.top + 18;
      if (on === btn.down) continue;
      btn.down = on;
      btn.sprite.setFrame(on ? 1 : 0);
      btn.label.setY(btn.top + (on ? 9 : 3));
      if (!on) continue;
      click();
      this.ctx.fx.flash(PRESS_MSG[btn.kind], hex(Colors.paper));
    }
  }
}

/** 「嗒」 */
function click(): void {
  const bus = openBus(0.25);
  if (!bus) return;
  const at = bus.now();
  tone(bus, { at, dur: 0.05, type: 'square', f0: 1400, f1: 900, gain: 0.5 });
  setTimeout(() => bus.close(), 200);
}
