class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data) {
    const { width, height } = this.scale;
    const title = data.win ? '🎉 通关！' : '💀 游戏结束';
    const color = data.win ? '#06d6a0' : '#ef476f';

    this.add.text(width / 2, height / 2 - 60, title, { fontSize: '48px', fontFamily: 'monospace', color }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 10, `得分: ${data.score}`, { fontSize: '28px', fontFamily: 'monospace', color: '#ffd166' }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 70, '按 空格 或 点击 重新开始', { fontSize: '18px', fontFamily: 'monospace', color: '#aaaaaa' }).setOrigin(0.5);

    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('Game'));
    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
