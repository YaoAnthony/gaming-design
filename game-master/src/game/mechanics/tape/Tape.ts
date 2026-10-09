// ===== 胶带：发着金光的一卷胶带，碰到就捡起来，心的上限 +1 =====
// - 拿过就一直有效：上限加了几颗、哪几卷捡过了，都带到下一层、存进存档（persist）；
//   捡过的那一卷死了、按 R、下一周目都不会再出现（不然能反复刷心）
// - 地上的胶带：有重力（ctx.loose，和钥匙一样：悬空就掉，站在移动方块 / 纸上被带着走，会被怪物推），停着时上下浮；
//   背后一圈金光一胀一缩、往上冒金色火星，周围照亮一小圈
// - 捡起来：播 eat.mp3，一圈金光炸开、胶带放大淡出，左上角多一颗满的心
import Phaser from 'phaser';
import type { PlayContext } from '@/game/core/PlayContext';
import type { LooseItem } from '@/game/core/LooseItems';
import type { SpawnAt, LooseCheckpoint } from '@/type';
import type { Mechanic } from '../define';
import { Colors, hex } from '@/shared/palette';

/** 一卷加几颗心；捡起来的声音；光晕一胀一缩的周期；光晕颜色；碰撞框（像素） */
export const TAPE = { hearts: 1, sound: { key: 'eat', volume: 0.8 }, pulseMs: 570, glow: 0xffd54a, body: { w: 20, h: 18 } };

/** 存档 / 带到下一层的数据：上限加了几颗、捡过的是哪几卷（层 id:格子） */
interface Saved { bonus: number; taken: string[] }

interface GroundTape {
  id: string;
  /** 光晕、胶带、火星：一起跟着物理体走（落地压扁、空中歪也一起） */
  box: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  /** 周围那一小圈暖光（画面效果关了是 null） */
  lamp: Phaser.GameObjects.Image | null;
  tweens: Phaser.Tweens.Tween[];
  loose: LooseItem;
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

  /** 地图上的胶带物件：放在那一格正中，有重力（悬空就落到下面的地上）；捡过的不放 */
  add(at: SpawnAt): void {
    const id = `${this.ctx.floor.id}:${at.cell.x},${at.cell.y}`;
    if (this.taken.has(id)) return;
    const { scene } = this.ctx, T = this.ctx.cfg.tile, { x, y } = at;
    const halo = scene.add.circle(0, 0, T * 0.5, TAPE.glow, 0.3).setBlendMode('ADD');
    const img = scene.add.image(0, 0, 'tape');
    const embers = scene.add.particles(0, 0, 'spark', {
      tint: TAPE.glow, blendMode: 'ADD', lifespan: 900, frequency: 220, quantity: 1,
      speed: { min: 8, max: 22 }, angle: { min: 250, max: 290 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, T * 0.35), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    });
    const box = scene.add.container(x, y, [halo, img, embers]).setDepth(2.4);
    const lamp = this.ctx.fx.light(x, y, 'tape');
    const tweens = [scene.tweens.add({ targets: halo, scale: 1.3, alpha: 0.12, duration: TAPE.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.inOut' })];
    const loose = this.ctx.loose.add({ sprite: box, scale: 1, height: img.height, around: lamp ? [lamp] : [], tint: TAPE.glow }, x, y, TAPE.body);
    this.ground.push({ id, box, img, lamp, tweens, loose });
  }

  /** 重置：地上的胶带回到原位（按 R 只管这个房间的；捡过的已经不在了） */
  onReset(scope: 'room' | 'world' | 'level'): void { this.ctx.loose.reset(scope, this.ground.map(g => g.loose)); }

  /** 拿过的胶带加的心（每进一层都要重新加到这一层的生命值上） */
  start(): void {
    if (this.bonus) this.ctx.addMaxHearts(this.bonus);
  }

  updateAlive(): void {
    if (!this.ground.length) return;
    const r = this.ctx.player.rect();
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      if (!Phaser.Geom.Intersects.RectangleToRectangle(this.ctx.loose.rect(g.loose), r)) continue;
      this.ground.splice(i, 1);
      this.pick(g);
    }
  }

  persist(): Saved | undefined {
    return this.bonus || this.taken.size ? { bonus: this.bonus, taken: [...this.taken] } : undefined;
  }

  checkpointState() {
    return this.ground.map(g => ({ id: g.id, loose: this.ctx.loose.checkpointItem(g.loose) }));
  }

  restoreCheckpoint(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (const s of data as { id: string; loose: LooseCheckpoint }[]) {
      const g = this.ground.find(g => g.id === s.id);
      if (g) this.ctx.loose.restoreItem(g.loose, s.loose);
    }
  }

  destroy(): void {
    this.ground.forEach(g => this.remove(g));
    this.ground = [];
  }

  private pick(g: GroundTape): void {
    const { ctx } = this, { scene } = ctx, x = g.box.x, y = g.box.y;
    this.taken.add(g.id);
    this.bonus += TAPE.hearts;
    ctx.addMaxHearts(TAPE.hearts);
    if (scene.cache.audio.exists(TAPE.sound.key)) scene.sound.play(TAPE.sound.key, { volume: TAPE.sound.volume });
    ctx.sparks.explode(14, x, y);
    ctx.fx.flash('msg.tapeGot', hex(Colors.gold));
    const burst = scene.add.circle(x, y, ctx.cfg.tile * 0.45, TAPE.glow, 0.7).setDepth(9).setBlendMode('ADD');
    scene.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => burst.destroy() });
    // 地上那一卷：放大、往上飘、淡出；物理体、光晕、火星、暖光马上收掉
    ctx.loose.remove(g.loose);
    g.tweens.forEach(t => t.remove());
    g.box.each((o: Phaser.GameObjects.GameObject) => { if (o !== g.img) o.destroy(); });
    g.lamp?.destroy();
    scene.tweens.add({ targets: g.img, scale: 1.9, y: g.img.y - 14, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => g.box.destroy() });
  }

  private remove(g: GroundTape): void {
    this.ctx.loose.remove(g.loose);
    g.tweens.forEach(t => t.remove());
    g.box.destroy();
    g.lamp?.destroy();
  }
}
