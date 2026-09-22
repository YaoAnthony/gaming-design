// ===== 加载资产，然后跳到目标场景 =====
import Phaser from 'phaser';
import { IMAGES, SPRITESHEETS } from '@/asset';
import { SCENE } from '@/game/bridge';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENE.boot); }

  preload(): void {
    SPRITESHEETS.forEach(s => this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }));
    IMAGES.forEach(i => this.load.image(i.key, i.url));
  }

  create(): void {
    const next = (this.game.registry.get('bootNext') as string | undefined) ?? SCENE.game;
    const data = (this.game.registry.get('bootData') as object | undefined) ?? {};
    this.scene.start(next, data);
  }
}
