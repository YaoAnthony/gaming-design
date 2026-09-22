// 编辑器场景：显示当前房间，鼠标左键画、右键擦。物品栏等 DOM 在 editor.js 里。
class EditorScene extends Phaser.Scene {
  constructor() { super('Editor'); }

  create() {
    const ES = window.EditorState; this.ES = ES;
    const T = CFG.TILE, m = ES.model;
    this.cameras.main.setBackgroundColor('#141a2c');
    this.cameras.main.setScroll(0, 0);

    this.map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: m.roomW, height: m.roomH });
    const ts = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.layer = this.map.createBlankLayer('room', ts, 0, 0);
    this.entityImgs = new Map();

    // 网格线
    const grid = this.add.graphics().setDepth(1);
    grid.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= m.roomW; x++) grid.lineBetween(x * T, 0, x * T, m.roomH * T);
    for (let y = 0; y <= m.roomH; y++) grid.lineBetween(0, y * T, m.roomW * T, y * T);

    this.overlay = this.add.graphics().setDepth(3);
    this.cursor = this.add.rectangle(0, 0, T, T).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4).setVisible(false);

    this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', p => this.paint(p));
    this.input.on('pointermove', p => { this.moveCursor(p); if (p.isDown) this.paint(p); });
    this.input.on('pointerout', () => this.cursor.setVisible(false));

    this.refreshAll();
    window.dispatchEvent(new CustomEvent('editor-scene-ready', { detail: this }));
  }

  key() { return WorldModel.keyAt(this.ES.model, this.ES.room.rx, this.ES.room.ry); }
  rows() { return this.ES.model.rooms[this.key()]; }

  cellAt(p) {
    const T = CFG.TILE, m = this.ES.model;
    const x = Math.floor(p.worldX / T), y = Math.floor(p.worldY / T);
    if (x < 0 || y < 0 || x >= m.roomW || y >= m.roomH) return null;
    return { x, y };
  }

  moveCursor(p) {
    const c = this.cellAt(p);
    this.cursor.setVisible(!!c);
    if (!c) return;
    this.cursor.setPosition(c.x * CFG.TILE, c.y * CFG.TILE);
    const ch = this.rows()[c.y][c.x];
    const def = classify(ch).def;
    const status = document.getElementById('status');
    if (status) status.textContent = `(${c.x}, ${c.y})  ${def.name}`;
  }

  paint(p) {
    const c = this.cellAt(p);
    if (!c) return;
    const id = p.rightButtonDown() ? '.' : this.ES.brush;
    this.setCell(c.x, c.y, id);
  }

  setCell(x, y, id) {
    const m = this.ES.model, k = this.key();
    if (this.rows()[y][x] === id) return;
    const cls = classify(id);
    let fullRefresh = false;
    if (cls.kind === 'entity' && cls.def.unique) { WorldModel.clearUnique(m, id); fullRefresh = true; }
    WorldModel.setCell(m, k, x, y, id);
    if (fullRefresh) this.refreshAll(); else { this.refreshCell(x, y); this.updateSupport(); }
    this.ES.save();
  }

  refreshCell(x, y) {
    const T = CFG.TILE;
    const ch = this.rows()[y][x];
    const cls = classify(ch);
    const key = x + ',' + y;
    if (this.entityImgs.has(key)) { this.entityImgs.get(key).destroy(); this.entityImgs.delete(key); }
    if (cls.kind === 'tile') {
      const f = Terrain.frameOf(ch);
      if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
    } else {
      this.layer.removeTileAt(x, y);
      const img = this.add.image(x * T + T / 2, y * T + T / 2, cls.def.texture).setDepth(2);
      const sc = Math.min(T / img.width, T / img.height) * 0.9;
      img.setScale(sc);
      this.entityImgs.set(key, img);
    }
  }

  refreshAll() {
    const m = this.ES.model;
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y);
    this.updateSupport();
  }

  // 标出一开始就会掉落的格子（没连到锚点的可掉落砖块）
  updateSupport() {
    const T = CFG.TILE, m = this.ES.model;
    this.overlay.clear();
    if (!this.ES.showSupport) return;
    const ox = this.ES.room.rx * m.roomW, oy = this.ES.room.ry * m.roomH;
    const un = Terrain.findUnsupported(WorldModel.rows(m));
    this.overlay.fillStyle(0xff3355, 0.45);
    this.overlay.lineStyle(2, 0xff3355, 0.9);
    un.forEach(c => {
      const lx = c.x - ox, ly = c.y - oy;
      if (lx < 0 || ly < 0 || lx >= m.roomW || ly >= m.roomH) return;
      this.overlay.fillRect(lx * T, ly * T, T, T);
      this.overlay.strokeRect(lx * T + 1, ly * T + 1, T - 2, T - 2);
    });
  }
}
