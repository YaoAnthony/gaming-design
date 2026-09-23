// ===== 编辑器画布：显示当前房间，左键画、右键擦。侧边栏在 React 里。=====
import Phaser from 'phaser';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { bridge, EVT, SCENE } from '@/game/bridge';
import { store } from '@/redux/store';
import { paintCell, paintEntity, paintFog, paintFuse } from '@/redux/slices/editorSlice';
import { TILE_FRAMES } from '@/asset';
import { FOG_ZONE_COLORS } from '@/ui/editor/fogZones';

export class EditorScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entityImgs = new Map<string, Phaser.GameObjects.Image>();
  private overlay!: Phaser.GameObjects.Graphics;
  private fogLayer!: Phaser.GameObjects.Graphics;
  private fuseTiles!: Phaser.Tilemaps.TilemapLayer;
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
    this.fuseTiles = map.createBlankLayer('fuse', ts, 0, 0)!;
    this.fuseTiles.setDepth(2.2);

    this.grid = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(3);
    this.fogLayer = this.add.graphics().setDepth(2.5);
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

  /** 保险：每帧核对一次版本号，订阅回调万一漏了也最多晚一帧 */
  update(): void {
    const s = this.state();
    if (s.version !== this.lastVersion || this.key() !== this.lastRoomKey) this.refreshAll();
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
    const key = this.key();
    const tile = classify(this.rows()[c.y]?.[c.x] ?? '.').def;
    const ent = key ? classify(this.state().model.entities?.[key]?.[c.y]?.[c.x] ?? '.') : null;
    this.game.events.emit('editor:status', `(${c.x}, ${c.y})  ${tile.name}${ent && ent.kind === 'entity' ? ' + ' + ent.def.name : ''}`);
  }

  private paint(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    const key = this.key();
    if (!c || !key) return;
    const brush = this.state().brush;
    if (brush === 'fuse') {
      const on = !p.rightButtonDown();
      const cur = this.state().model.fuse?.[key]?.[c.y]?.[c.x] === 'W';
      if (cur === on) return;
      store.dispatch(paintFuse({ key, x: c.x, y: c.y, on }));
      return;
    }
    if (brush.startsWith('fog:')) {
      // 迷雾区画笔：右键擦除
      const zone = p.rightButtonDown() ? '.' : brush.slice(4);
      const cur = this.state().model.fog?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === zone) return;
      store.dispatch(paintFog({ key, x: c.x, y: c.y, zone }));
      return;
    }
    const cls = classify(brush);
    if (cls.kind === 'entity') {
      // 物件画在自己那一层，底下的砖块（比如尖刺）保留；右键只擦物件
      const ch = p.rightButtonDown() ? '.' : brush;
      const cur = this.state().model.entities?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === ch) return;
      store.dispatch(paintEntity({ key, x: c.x, y: c.y, ch, unique: cls.def.unique }));
      return;
    }
    const ch = p.rightButtonDown() ? '.' : brush;
    if (this.rows()[c.y][c.x] === ch) return;
    store.dispatch(paintCell({ key, x: c.x, y: c.y, ch }));
  }

  /** grid 是把物件替换成空气后的网格，只用来算砖块的拼贴掩码；分类要看原始字符 */
  private refreshCell(x: number, y: number, grid: string[][]): void {
    const T = this.T, key = this.key();
    const k = `${x},${y}`;
    const old = this.entityImgs.get(k);
    if (old) { old.destroy(); this.entityImgs.delete(k); }
    // 砖块层
    const f = Terrain.frameAt(grid, x, y, 'editor');
    if (f < 0) this.layer.removeTileAt(x, y); else this.layer.putTileAt(f, x, y);
    // 物件层（叠在砖块上）
    const ech = (key && this.state().model.entities?.[key]?.[y]?.[x]) || '.';
    const cls = classify(ech);
    if (cls.kind === 'entity') {
      // 按游戏里的真实尺寸画，以这一格的中心为中心，所见即所得
      const img = this.add.image(x * T + T / 2, y * T + T / 2, cls.def.texture).setDepth(2.3);
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
    const grid = this.rows().map(r => r.split(''));
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y, grid);
    this.drawFogZones();
    this.drawFuse();
    this.updateSupport();
  }

  /** 引线层：按四周连接自动拼贴，编辑器里整条线可见（游戏里只有端点）。
   *  掩码用整张大地图算，所以房间边缘的引线会显示成"连到隔壁房间"，而不是端头。 */
  private drawFuse(): void {
    const s = this.state(), m = s.model;
    const world = fuseRows(m).map(r => r.split(''));
    const ox = s.room.rx * m.roomW, oy = s.room.ry * m.roomH;
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) {
      if (world[oy + y]?.[ox + x] !== 'W') { this.fuseTiles.removeTileAt(x, y); continue; }
      this.fuseTiles.putTileAt(TILE_FRAMES.fuse + Terrain.maskAt(world, ox + x, oy + y), x, y);
    }
  }

  /** 迷雾区叠加：按区号上色，编辑时能看见，游戏里是黑的 */
  private drawFogZones(): void {
    const T = this.T, s = this.state(), key = this.key();
    this.fogLayer.clear();
    const rows = key ? s.model.fog?.[key] : undefined;
    if (!rows) return;
    rows.forEach((row, y) => [...row].forEach((z, x) => {
      const color = FOG_ZONE_COLORS[z];
      if (color === undefined) return;
      this.fogLayer.fillStyle(color, 0.35); this.fogLayer.fillRect(x * T, y * T, T, T);
      this.fogLayer.lineStyle(1, color, 0.8); this.fogLayer.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }));
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
