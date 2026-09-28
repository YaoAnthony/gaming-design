// ===== 爆炸特效：冲击环 + 每个被炸掉的格子喷火花 + 震屏 =====
import type Phaser from 'phaser';
import type { CellRef } from '@/type';

export type SparkEmitter = Phaser.GameObjects.Particles.ParticleEmitter;

export function createSparkEmitter(scene: Phaser.Scene): SparkEmitter {
  return scene.add.particles(0, 0, 'spark', {
    speed: { min: 60, max: 220 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 250, max: 500 },
    scale: { start: 1, end: 0 },
    gravityY: 600,
    emitting: false,
  }).setDepth(9);
}

export function playExplosion(scene: Phaser.Scene, sparks: SparkEmitter, T: number, center: CellRef, removed: CellRef[], radius: number): void {
  removed.forEach(c => sparks.explode(6, c.x * T + T / 2, c.y * T + T / 2));
  scene.cameras.main.shake(90, 0.006);
  const ring = scene.add.circle(center.x * T + T / 2, center.y * T + T / 2, T * 0.4, 0xffffff, 0.5).setDepth(9);
  scene.tweens.add({ targets: ring, scale: radius * 2.2, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
}
