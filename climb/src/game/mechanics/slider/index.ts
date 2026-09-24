// ===== 通用机制：设置房间的滑块 =====
// 喇叭图标右边一条轨道，走过去把滑钮推到哪儿，绑定的设置就是多少（即时生效、记在本地）。
// 以后要加别的设置 = 再注册一个绑定不同 config 字段的物件。
import Phaser from 'phaser';
import type { SliderSpawn } from '@/type';
import { store } from '@/redux/store';
import { setConfig } from '@/redux/slices/configSlice';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';

interface Slider { spawn: SliderSpawn; x0: number; x1: number; y: number; knob: Phaser.GameObjects.Rectangle; waves: Phaser.GameObjects.Graphics; value: number }

class Sliders implements Mechanic {
  private sliders: Slider[] = [];

  constructor(private ctx: PlayContext) {}

  addSlider(spawn: SliderSpawn): void {
    const scene = this.ctx.scene, T = this.ctx.cfg.tile;
    const floor = spawn.y + T / 2;
    scene.add.image(spawn.x, floor - 4, 'volume').setOrigin(0.5, 1).setDepth(2.4);
    const x0 = spawn.x + T * 0.9, x1 = spawn.x + spawn.length * T, y = floor - 12;
    const rail = scene.add.graphics().setDepth(2.3);
    rail.lineStyle(6, 0x0b0b14, 0.9); rail.lineBetween(x0, y, x1, y);
    rail.lineStyle(2, 0x9aa0b4, 0.9); rail.lineBetween(x0, y, x1, y);
    for (let i = 0; i <= 4; i++) { const tx = x0 + (x1 - x0) * i / 4; rail.lineStyle(2, 0x9aa0b4, 0.6); rail.lineBetween(tx, y - 6, tx, y + 6); }
    const knob = scene.add.rectangle(x0, y, 14, 24, 0xffd166).setStrokeStyle(2, 0x0b0b14).setDepth(2.6);
    const waves = scene.add.graphics().setDepth(2.5);
    const s: Slider = { spawn, x0, x1, y, knob, waves, value: NaN };
    this.sliders.push(s);
    this.sync(s, store.getState().config[spawn.config]);
  }

  /** 人走进滑钮就把它推着走；停在哪儿，设置就是多少 */
  updateAlive(): void {
    const b = this.ctx.player.body;
    this.sliders.forEach(s => {
      // 别处改了设置（比如读档），滑钮跟过去
      this.sync(s, store.getState().config[s.spawn.config]);
      const half = 7, kx = s.knob.x;
      if (b.bottom <= s.y - 12 || b.top >= s.y + 12) return;
      if (b.right <= kx - half || b.left >= kx + half) return;
      const nx = Phaser.Math.Clamp(b.center.x < kx ? b.right + half : b.left - half, s.x0, s.x1);
      if (nx === kx) return;
      const t = (nx - s.x0) / (s.x1 - s.x0);
      const value = Math.round((s.spawn.min + (s.spawn.max - s.spawn.min) * t) * 100) / 100;
      store.dispatch(setConfig({ [s.spawn.config]: value }));
      this.sync(s, value);
      s.knob.x = nx;
    });
  }

  /** 数值 → 滑钮位置 + 喇叭旁的声波 */
  private sync(s: Slider, value: number): void {
    if (value === s.value) return;
    s.value = value;
    const t = (value - s.spawn.min) / (s.spawn.max - s.spawn.min);
    s.knob.x = s.x0 + (s.x1 - s.x0) * Phaser.Math.Clamp(t, 0, 1);
    const g = s.waves, cx = s.spawn.x + 10, cy = s.y - 4;
    g.clear();
    if (t <= 0) { g.lineStyle(2, 0xef476f, 0.9); g.lineBetween(cx + 4, cy - 5, cx + 12, cy + 5); g.lineBetween(cx + 12, cy - 5, cx + 4, cy + 5); return; }
    const n = t < 0.34 ? 1 : t < 0.67 ? 2 : 3;
    g.lineStyle(2, 0xffd166, 0.9);
    for (let i = 1; i <= n; i++) g.beginPath(), g.arc(cx, cy, 5 + i * 5, -0.9, 0.9, false), g.strokePath();
  }
}

const slider = defineMechanic({
  id: 'slider', name: '设置滑块', desc: '推着滑钮改设置',
  scope: 'global',
  create: ctx => new Sliders(ctx),
});

slider.entity({
  id: 'V', name: '音量滑块', desc: '设置房间用：喇叭图标右边一条轨道，走过去把滑钮推到哪儿，音乐就多大', texture: 'volume', color: 0xffd166, origin: [0.5, 1],
  spawn: (s, at) => s.addSlider({ x: at.x, y: at.y, length: 8, config: 'musicVolume', min: 0, max: 1 }),
});
