// ===== 胶带：发着金光的一卷胶带，碰到就捡起来，心的上限 +1 =====
// - 拿过就一直有效：上限加了几颗、哪几卷捡过了，都带到下一层、存进存档（persist）；
//   捡过的那一卷死了、按 R、下一周目都不会再出现（不然能反复刷心）
// - 地上的胶带：上下浮动，背后一圈金光一胀一缩、往上冒金色火星，周围照亮一小圈
// - 捡起来：播 eat.mp3，一圈金光炸开、胶带放大淡出，左上角多一颗满的心
import Phaser from 'phaser';
import type { PlayContext } from '@/game/core/PlayContext';
import type { SpawnAt } from '@/type';
import type { Mechanic } from '../define';
import { Colors, hex } from '@/shared/palette';

/** 一卷加几颗心；捡起来的声音；浮动幅度 / 周期；光晕颜色 */
export const TAPE = { hearts: 1, sound: { key: 'eat', volume: 0.8 }, bobPx: 3, bobMs: 950, glow: 0xffd54a };

/** 存档 / 带到下一层的数据：上限加了几颗、捡过的是哪几卷（层 id:格子） */
interface Saved { bonus: number; taken: string[] }

interface GroundTape {
  id: string;
  img: Phaser.GameObjects.Image;
  objs: Phaser.GameObjects.GameObject[];
  tweens: Phaser.Tweens.Tween[];
}

export class Tape implements Mechanic {
  private bonus: number;
  private taken: Set<string>;
  private ground: GroundTape[] = [];

  constructor(private ctx: PlayContext) {
    const s = ctx.carried('tape') as Partial<Saved> | undefined;
    this.bonus = typeof s?.bonus === 'number' && s.bonus > 0 ? Math.floor(s.bonus) : 0;
    this.taken = new Set(Array.isArray(s?.taken) ? s.taken.filter((k): k is string => typeof k === 'string') : []);
  }

  /** 地图上的胶带物件：浮在那一格正中（捡过的不放） */
  add(at: SpawnAt): void {
    const id = `${this.ctx.floor.id}:${at.cell.x},${at.cell.y}`;
    if (this.taken.has(id)) return;
    const { scene } = this.ctx, T = this.ctx.cfg.tile, { x, y } = at;
    const halo = scene.add.circle(x, y, T * 0.5, TAPE.glow, 0.3).setDepth(2.3).setBlendMode('ADD');
    const img = scene.add.image(x, y, 'tape').setDepth(2.4);
    const embers = scene.add.particles(x, y, 'spark', {
      tint: TAPE.glow, blendMode: 'ADD', lifespan: 900, frequency: 220, quantity: 1,
      speed: { min: 8, max: 22 }, angle: { min: 250, max: 290 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, T * 0.35), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(2.45);
    const lamp = this.ctx.fx.light(x, y, 'tape');
    const tweens = [
      scene.tweens.add({ targets: img, y: y - TAPE.bobPx, duration: TAPE.bobMs, yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
      scene.tweens.add({ targets: halo, scale: 1.3, alpha: 0.12, duration: TAPE.bobMs * 0.6, yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
    ];
    this.ground.push({ id, img, objs: lamp ? [halo, img, embers, lamp] : [halo, img, embers], tweens });
  }

  /** 拿过的胶带加的心（每进一层都要重新加到这一层的生命值上） */
  start(): void {
    if (this.bonus) this.ctx.addMaxHearts(this.bonus);
  }

  updateAlive(): void {
    if (!this.ground.length) return;
    const r = this.ctx.player.rect();
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      if (!Phaser.Geom.Intersects.RectangleToRectangle(g.img.getBounds(), r)) continue;
      this.ground.splice(i, 1);
      this.pick(g);
    }
  }

  persist(): Saved | undefined {
    return this.bonus || this.taken.size ? { bonus: this.bonus, taken: [...this.taken] } : undefined;
  }

  destroy(): void {
    this.ground.forEach(g => this.remove(g));
    this.ground = [];
  }

  private pick(g: GroundTape): void {
    const { ctx } = this, { scene } = ctx, x = g.img.x, y = g.img.y;
    this.taken.add(g.id);
    this.bonus += TAPE.hearts;
    ctx.addMaxHearts(TAPE.hearts);
    if (scene.cache.audio.exists(TAPE.sound.key)) scene.sound.play(TAPE.sound.key, { volume: TAPE.sound.volume });
    ctx.sparks.explode(14, x, y);
    ctx.fx.flash('msg.tapeGot', hex(Colors.gold));
    const burst = scene.add.circle(x, y, ctx.cfg.tile * 0.45, TAPE.glow, 0.7).setDepth(9).setBlendMode('ADD');
    scene.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => burst.destroy() });
    // 地上那一卷：放大、往上飘、淡出；光晕、火星、暖光马上收掉
    g.tweens.forEach(t => t.remove());
    g.objs.filter(o => o !== g.img).forEach(o => o.destroy());
    scene.tweens.add({ targets: g.img, scale: 1.9, y: y - 14, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => g.img.destroy() });
  }

  private remove(g: GroundTape): void {
    g.tweens.forEach(t => t.remove());
    g.objs.forEach(o => o.destroy());
  }
}
