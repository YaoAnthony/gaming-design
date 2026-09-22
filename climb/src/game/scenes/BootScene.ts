// ===== 加载资产，然后跳到目标场景 =====
import Phaser from 'phaser';
import { AUDIO, IMAGES, SPRITESHEETS, TILE_SIZE } from '@/asset';
import { SCENE } from '@/game/bridge';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENE.boot); }

  preload(): void {
    SPRITESHEETS.forEach(s => this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }));
    IMAGES.forEach(i => this.load.image(i.key, i.url));
    AUDIO.forEach(a => this.load.audio(a.key, a.url));
  }

  create(): void {
    if (!this.textures.exists('fogsquare')) {
      // 迷雾擦除用的两支笔刷：硬方块（把亮格整个擦清）+ 柔光圆（往暗处晕开）
      const sq = this.textures.createCanvas('fogsquare', TILE_SIZE, TILE_SIZE)!;
      sq.context.fillStyle = '#fff'; sq.context.fillRect(0, 0, TILE_SIZE, TILE_SIZE); sq.refresh();
      const size = TILE_SIZE * 3;
      const gl = this.textures.createCanvas('fogglow', size, size)!;
      const g = gl.context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      gl.context.fillStyle = g; gl.context.fillRect(0, 0, size, size); gl.refresh();
    }
    const next = (this.game.registry.get('bootNext') as string | undefined) ?? SCENE.game;
    const data = (this.game.registry.get('bootData') as object | undefined) ?? {};
    this.scene.start(next, data);
  }
}
