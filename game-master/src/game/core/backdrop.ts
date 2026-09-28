// ===== 背景：渐变天空 + 星星 =====
import Phaser from 'phaser';

export function buildBackground(scene: Phaser.Scene, levelW: number, levelH: number): void {
  if (!scene.textures.exists('sky')) {
    const c = scene.textures.createCanvas('sky', 4, 256)!;
    const ctx = c.context;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#5b7fb5'); grd.addColorStop(0.4, '#23305a'); grd.addColorStop(1, '#0b0b14');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, 256); c.refresh();
  }
  scene.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(levelW, levelH).setDepth(-10);
  for (let i = 0; i < 160; i++) {
    scene.add.circle(Phaser.Math.Between(0, levelW), Phaser.Math.Between(0, levelH * 0.8),
      Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).setDepth(-9);
  }
}
