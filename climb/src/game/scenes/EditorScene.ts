// ===== 编辑器画布：显示当前房间，左键画、右键擦。侧边栏在 React 里。=====
import Phaser from 'phaser';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { bridge, EVT, SCENE } from '@/game/bridge';
import { store } from '@/redux/store';
import { paintCell } from '@/redux/slices/editorSlice';

export class EditorScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entityImgs = new Map<string, Phaser.GameObjects.Image>();
  private overlay!: Phaser.GameObjects.Graphics;
  private cursor!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  private T = 32;
  private lastVersion = -1;
  private lastRoomKey: string | null = null;

  constructor() { super(SCENE.editor); }

  create(): void {
    const { model } = store.getState().editor;
    this.T = store.getState().config.tile;
    const T = this.T;
    this.cameras.main.setBackgroundColor('#141a2c');
    this.cameras.main.setScroll(0, 0);

    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: model.roomW, height: model.roomH });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.layer = map.createBlankLayer('room', ts, 0, 0)!;

    this.grid = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(3);
    this.cursor = this.add.rectangle(0, 0, T, T).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4).setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.paint(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.moveCursor(p); if (p.isDown) this.paint(p); });
    this.input.on('pointerout', () => this.cursor.setVisible(false));

    const reload = () => this.refreshAll();
    bridge.on(EVT.editorReload, reload);
    const unsubscribe = store.subscribe(() => {
      const s = store.getState().editor;
      const key = roomKeyAt(s.model, s.room.rx, s.room.ry);
      if (s.version !== this.lastVersion || key !== this.lastRoomKey) this.refreshAll();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { bridge.off(EVT.editorReload, reload); unsubscribe(); });

    this.refreshAll();
  }

  private state() { return store.getState().editor; }
  private key(): string | null { const s = this.state(); return roomKeyAt(s.model, s.room.rx, s.room.ry); }
  private rows(): string[] { const k = this.key(); return k ? this.state().model.rooms[k] : []; }

  private cellAt(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const { model } = this.state();
    const x = Math.floor(p.worldX / this.T), y = Math.floor(p.worldY / this.T);
    if (x < 0 || y < 0 || x >= model.roomW || y >= model.roomH) return null;
    return { x, y };
  }

  private moveCursor(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    this.cursor.setVisible(!!c);
    if (!c) return;
    this.cursor.setPosition(c.x * this.T, c.y * this.T);
    const def = classify(this.rows()[c.y]?.[c.x] ?? '.').def;
    this.game.events.emit('editor:status', `(${c.x}, ${c.y})  ${def.name}`);
  }

  private paint(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    const key = this.key();
    if (!c || !key) return;
    const ch = p.rightButtonDown() ? '.' : this.state().brush;
    if (this.rows()[c.y][c.x] === ch) return;
    const cls = classify(ch);
    store.dispatch(paintCell({ key, x: c.x, y: c.y, ch, unique: cls.kind === 'entity' && cls.def.unique }));
  }

  private refreshCell(x: number, y: number): void {
    const T = this.T;
    const ch = this.rows()[y]?.[x] ?? '.';
    const cls = classify(ch);
    const k = `${x},${y}`;
    const old = this.entityImgs.get(k);
    if (old) { old.destroy(); this.entityImgs.delete(k); }
    if (cls.kind === 'tile') {
      const f = Terrain.frameOf(ch);
      if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
    } else {
      this.layer.removeTileAt(x, y);
      const img = this.add.image(x * T + T / 2, y * T + T / 2, cls.def.texture).setDepth(2);
      img.setScale(Math.min(T / img.width, T / img.height) * 0.9);
      this.entityImgs.set(k, img);
    }
  }

  private refreshAll(): void {
    const s = this.state();
    this.lastVersion = s.version; this.lastRoomKey = this.key();
    const T = this.T, m = s.model;
    this.grid.clear(); this.grid.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= m.roomW; x++) this.grid.lineBetween(x * T, 0, x * T, m.roomH * T);
    for (let y = 0; y <= m.roomH; y++) this.grid.lineBetween(0, y * T, m.roomW * T, y * T);
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y);
    this.updateSupport();
  }

  /** 标出一开始就会掉落的格子 */
  private updateSupport(): void {
    const s = this.state(), T = this.T, m = s.model;
    this.overlay.clear();
    if (!s.showSupport) return;
    const ox = s.room.rx * m.roomW, oy = s.room.ry * m.roomH;
    this.overlay.fillStyle(0xff3355, 0.45); this.overlay.lineStyle(2, 0xff3355, 0.9);
    Terrain.findUnsupported(worldRows(m)).forEach(c => {
      const lx = c.x - ox, ly = c.y - oy;
      if (lx < 0 || ly < 0 || lx >= m.roomW || ly >= m.roomH) return;
      this.overlay.fillRect(lx * T, ly * T, T, T);
      this.overlay.strokeRect(lx * T + 1, ly * T + 1, T - 2, T - 2);
    });
  }
}
