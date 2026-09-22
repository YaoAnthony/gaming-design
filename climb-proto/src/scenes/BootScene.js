// 从注册表生成所有贴图：砖块图集（按注册顺序排帧）、物件贴图、粒子
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const T = CFG.TILE;
    if (!this.textures.exists('tiles')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const drawable = Tiles.filter(d => d.draw);
      Tiles.list().forEach(d => { d.frame = -1; });
      drawable.forEach((d, k) => { d.frame = k; d.draw(g, k * T, 0, T); });
      g.generateTexture('tiles', Math.max(1, drawable.length) * T, T);
      drawable.forEach((d, k) => this.textures.get('tiles').add(k, 0, k * T, 0, T, T));
      g.clear();

      Entities.list().forEach(e => { const { w, h } = e.draw(g); g.generateTexture(e.texture, w, h); g.clear(); });

      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 6, 6);
      g.generateTexture('spark', 6, 6);
      g.destroy();
    }
    const next = this.game.registry.get('bootNext') || 'Game';
    this.scene.start(next, this.scene.settings.data || {});
  }
}
