// ===== 砖块的状态变化：炸碎、烧裂、落地（B1 设定集「状态必须连续」：完整 → 裂开 → 碎片 → 空位） =====
// 炸碎：那种材料的几块碎块往上崩、转着落下去淡掉，原位一个虚线空位闪一下；
// 引线烧裂（岩石 → 碎岩）：一段裂纹从中间长出来、崩两粒碎屑（盖在已经换成碎岩的那一格上）；
// 碎块落地：落在地上的那一排底下各扬一小团尘。
// 贴图是 Aseprite asset/generators/tiles.py 生成的 tile_debris / tile_crack / tile_ghost / tile_dust（asset/index.ts 的 TILE_DEBRIS、TILE_FX）。
import Phaser from 'phaser';
import type { CellRef } from '@/type';
import { TILE_DEBRIS, TILE_FX } from '@/asset';

/** 碎块：每格崩出几块、往哪飞、多快 */
const DEBRIS = { perCell: 3, speed: { min: 70, max: 200 }, angle: { min: 205, max: 335 }, gravityY: 950, lifespan: { min: 550, max: 850 }, spin: 9 };
/** 虚线空位：多久淡掉、放大多少 */
const GHOST = { ms: 380, alpha: 0.55, grow: 1.08 };
const CRACK_ANIM = 'tile_crack', DUST_ANIM = 'tile_dust';

export class TileFx {
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(private scene: Phaser.Scene, private T: number) {
    const anims = scene.anims;
    if (!anims.exists(CRACK_ANIM) && scene.textures.exists(TILE_FX.crack)) {
      anims.create({ key: CRACK_ANIM, frames: anims.generateFrameNumbers(TILE_FX.crack, { start: 0, end: TILE_FX.crackFrames - 1 }), frameRate: 18 });
    }
    if (!anims.exists(DUST_ANIM) && scene.textures.exists(TILE_FX.dust)) {
      anims.create({ key: DUST_ANIM, frames: anims.generateFrameNumbers(TILE_FX.dust, { start: 0, end: TILE_FX.dustFrames - 1 }), frameRate: 16 });
    }
  }

  /** 这些格子被炸没 / 烧没了（mat = 原来那块砖的碎块材料，见 TileDef.debris；null = 不崩碎块）：碎块 + 虚线空位 */
  broken(cells: (CellRef & { mat: string | null })[]): void {
    const T = this.T;
    cells.forEach(({ x: cx, y: cy, mat }) => {
      if (!mat) return;
      const c = { x: cx, y: cy };
      const x = c.x * T + T / 2, y = c.y * T + T / 2;
      this.emitter(mat)?.explode(DEBRIS.perCell, x, y);
      if (!this.scene.textures.exists(TILE_FX.ghost)) return;
      const g = this.scene.add.image(x, y, TILE_FX.ghost).setAlpha(GHOST.alpha).setDepth(0.6);
      this.scene.tweens.add({ targets: g, alpha: 0, scale: GHOST.grow, duration: GHOST.ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    });
  }

  /** 这些格子被引线烧裂了（岩石 → 碎岩）：裂纹长出来 + 两粒碎屑 */
  cracked(cells: CellRef[]): void {
    const T = this.T;
    cells.forEach(c => {
      const x = c.x * T + T / 2, y = c.y * T + T / 2;
      if (this.scene.anims.exists(CRACK_ANIM)) {
        const s = this.scene.add.sprite(x, y, TILE_FX.crack, 0).setDepth(0.6);
        s.play(CRACK_ANIM).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
      }
      this.emitter('cracked')?.explode(2, x, y - T / 4);
    });
  }

  /** 一块碎块落地：它最下面那一排（下面不是它自己的格子）底下各扬一小团尘 */
  landed(cells: CellRef[]): void {
    if (!this.scene.anims.exists(DUST_ANIM)) return;
    const T = this.T, own = new Set(cells.map(c => `${c.x},${c.y}`));
    cells.filter(c => !own.has(`${c.x},${c.y + 1}`)).forEach(c => {
      for (const dx of [-0.3, 0.3]) {
        const s = this.scene.add.sprite((c.x + 0.5 + dx) * T, (c.y + 1) * T + 1, TILE_FX.dust, 0).setOrigin(0.5, 1).setDepth(9).setFlipX(dx < 0);
        s.play(DUST_ANIM).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
      }
    });
  }

  /** 某种材料的碎块发射器（第一次用到时建） */
  private emitter(mat: string): Phaser.GameObjects.Particles.ParticleEmitter | null {
    const have = this.emitters.get(mat);
    if (have) return have;
    const row = (TILE_DEBRIS.mats as readonly string[]).indexOf(mat);
    if (row < 0 || !this.scene.textures.exists(TILE_DEBRIS.key)) return null;
    const frames = Array.from({ length: TILE_DEBRIS.perMat }, (_, k) => row * TILE_DEBRIS.perMat + k);
    const e = this.scene.add.particles(0, 0, TILE_DEBRIS.key, {
      frame: frames,
      speed: DEBRIS.speed, angle: DEBRIS.angle, gravityY: DEBRIS.gravityY, lifespan: DEBRIS.lifespan,
      rotate: {
        onEmit: () => Phaser.Math.Between(0, 3) * 90,
        onUpdate: (p: Phaser.GameObjects.Particles.Particle, _k: string, _t: number, v: number) => v + (p.velocityX >= 0 ? DEBRIS.spin : -DEBRIS.spin),
      },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      emitting: false,
    }).setDepth(9);
    this.emitters.set(mat, e);
    return e;
  }
}
