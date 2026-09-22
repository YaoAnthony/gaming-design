const config = {
  type: Phaser.AUTO,
  width: CFG.viewW,
  height: CFG.viewH,
  parent: document.body,
  backgroundColor: '#0b0b14',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { y: CFG.gravity }, debug: false } },
  scene: [BootScene, GameScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
};
window.game = new Phaser.Game(config);
