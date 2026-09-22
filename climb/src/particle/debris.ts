// ===== 落石相关特效 =====
import type Phaser from 'phaser';
import type { SparkEmitter } from './explosion';

/** 怪物被压扁 */
export function playCrush(sparks: SparkEmitter, x: number, y: number): void {
  sparks.explode(14, x, y);
}

/** 碎块落地 */
export function playLand(scene: Phaser.Scene): void {
  scene.cameras.main.shake(120, 0.004);
}
