// 用代码生成所有贴图，不依赖图片资源
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // 玩家 32x48
    g.fillStyle(0x4cc9f0, 1);
    g.fillRoundedRect(0, 0, 32, 48, 6);
    g.fillStyle(0x1a1a2e, 1);
    g.fillRect(20, 12, 6, 6); // 眼睛
    g.generateTexture('player', 32, 48);
    g.clear();

    // 平台 tile 64x24
    g.fillStyle(0x2ec4b6, 1);
    g.fillRect(0, 0, 64, 24);
    g.fillStyle(0x1b998b, 1);
    g.fillRect(0, 18, 64, 6);
    g.generateTexture('platform', 64, 24);
    g.clear();

    // 金币 20x20
    g.fillStyle(0xffd166, 1);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xf4a261, 1);
    g.fillCircle(10, 10, 5);
    g.generateTexture('coin', 20, 20);
    g.clear();

    // 尖刺 32x24
    g.fillStyle(0xef476f, 1);
    g.fillTriangle(0, 24, 16, 0, 32, 24);
    g.generateTexture('spike', 32, 24);
    g.clear();

    // 敌人 32x28
    g.fillStyle(0x9b5de5, 1);
    g.fillRoundedRect(0, 0, 32, 28, 8);
    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 8, 6, 6);
    g.fillRect(20, 8, 6, 6);
    g.generateTexture('enemy', 32, 28);
    g.clear();

    // 终点旗帜 24x64
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 64);
    g.fillStyle(0x06d6a0, 1);
    g.fillTriangle(4, 0, 28, 12, 4, 24);
    g.generateTexture('flag', 28, 64);
    g.clear();

    this.scene.start('Game');
  }
}
