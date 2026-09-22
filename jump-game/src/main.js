const config = {
  type: Phaser.AUTO,
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  parent: document.body,
  backgroundColor: '#1a1a2e',
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: GAME_CONFIG.gravity }, debug: false },
  },
  scene: [BootScene, GameScene, GameOverScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
};

window.game = new Phaser.Game(config);
