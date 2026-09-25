// ===== 编辑器画布：显示当前房间，左键画、右键擦。侧边栏在 React 里。=====
import Phaser from 'phaser';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { FUSE_CHANNELS, fuseHas } from '@/game/fuse/channels';
import { DOOR_CHAR, fuseRows, lockGroup, nextFloorId, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { layoutText, textSize } from '@/game/world/font';
import { bridge, EVT, SCENE, type PickedCell } from '@/game/bridge';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { addText, currentModel, paintCell, paintDoor, paintEntity, paintFog, paintFuse, paintKey, removeText } from '@/redux/slices/editorSlice';
import { TILE_FRAMES } from '@/asset';
import { FOG_ZONE_COLORS } from '@/ui/editor/fogZones';

export class EditorScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entityImgs = new Map<string, Phaser.GameObjects.Image>();
  private overlay!: Phaser.GameObjects.Graphics;
  private fogLayer!: Phaser.GameObjects.Graphics;
  /** 引线：每种颜色一层（白色贴图按颜色染色），交叉的格子两层叠着都看得见 */
  private fuseTiles: Phaser.Tilemaps.TilemapLayer[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  private textLayer!: Phaser.GameObjects.Graphics;
  private textLabels: Phaser.GameObjects.Text[] = [];
  private keyImgs: Phaser.GameObjects.Image[] = [];
  private T = 32;
  private lastVersion = -1;
  private lastRoomKey: string | null = null;

  constructor() { super(SCENE.editor); }

  create(): void {
    const model = currentModel(store.getState().editor);
    this.T = store.getState().config.tile;
    const T = this.T;
    // 画布 = 一个房间；试玩回来时尺寸可能被游戏场景改过
    resizeGame(this.game, model.roomW * T, model.roomH * T);
    this.cameras.main.setSize(model.roomW * T, model.roomH * T);
    this.cameras.main.setBackgroundColor('#141a2c');
    this.cameras.main.setScroll(0, 0);

    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: model.roomW, height: model.roomH });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.layer = map.createBlankLayer('room', ts, 0, 0)!;
    this.fuseTiles = FUSE_CHANNELS.map(c => map.createBlankLayer('fuse' + c.id, ts, 0, 0)!.setDepth(2.2 + c.id * 0.01));

    this.grid = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(3);
    this.fogLayer = this.add.graphics().setDepth(2.5);
    this.textLayer = this.add.graphics().setDepth(2.6);
    this.cursor = this.add.rectangle(0, 0, T, T).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4).setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.state().picking) this.pickStart(p);   // 选试玩起点：不画东西
      else if (this.state().brush === 'text') this.placeText(p);
      else this.paint(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.moveCursor(p); if (p.isDown && !this.state().picking && this.state().brush !== 'text') this.paint(p); });
    this.input.on('pointerout', () => this.cursor.setVisible(false));

    const reload = () => this.refreshAll();
    bridge.on(EVT.editorReload, reload);
    const unsubscribe = store.subscribe(() => {
      const s = store.getState().editor;
      const key = roomKeyAt(currentModel(s), s.room.rx, s.room.ry);
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
  private model() { return currentModel(this.state()); }
  private key(): string | null { const s = this.state(); return roomKeyAt(currentModel(s), s.room.rx, s.room.ry); }
  private rows(): string[] { const k = this.key(); return k ? this.model().rooms[k] : []; }

  private cellAt(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const model = this.model();
    const x = Math.floor(p.worldX / this.T), y = Math.floor(p.worldY / this.T);
    if (x < 0 || y < 0 || x >= model.roomW || y >= model.roomH) return null;
    return { x, y };
  }

  /** 选试玩起点：把点的格子交给 React（它来判断能不能站、然后开始试玩） */
  private pickStart(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p), key = this.key();
    if (!c || !key || p.rightButtonDown()) return;
    const s = this.state(), m = currentModel(s);
    const cell: PickedCell = { key, x: c.x, y: c.y, wx: s.room.rx * m.roomW + c.x, wy: s.room.ry * m.roomH + c.y };
    bridge.emit(EVT.editorPickStart, cell);
  }

  private moveCursor(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    this.cursor.setVisible(!!c);
    if (!c) return;
    this.cursor.setStrokeStyle(this.state().picking ? 3 : 2, this.state().picking ? 0x80ed99 : 0xffffff, 0.9);   // 选起点时是绿框
    this.cursor.setPosition(c.x * this.T, c.y * this.T);
    const key = this.key();
    const tile = classify(this.rows()[c.y]?.[c.x] ?? '.').def;
    const ent = key ? classify(this.model().entities?.[key]?.[c.y]?.[c.x] ?? '.') : null;
    this.game.events.emit('editor:status', `(${c.x}, ${c.y})  ${tile.name}${ent && ent.kind === 'entity' ? ' + ' + ent.def.name : ''}`);
  }

  private paint(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    const key = this.key();
    if (!c || !key) return;
    const brush = this.state().brush;
    if (brush.startsWith('fuse:')) {
      // 引线：左键画这种颜色，右键只擦这种颜色（同一格别的颜色不动）
      const ch = Number(brush.slice(5));
      const on = !p.rightButtonDown();
      if (fuseHas(this.model().fuse?.[key]?.[c.y]?.[c.x], ch) === on) return;
      store.dispatch(paintFuse({ key, x: c.x, y: c.y, ch, on }));
      return;
    }
    if (brush.startsWith('door:') || brush.startsWith('key:')) {
      // 钥匙与门：门画在门层（游戏里烘进砖块），钥匙画在钥匙层；右键擦
      const isDoor = brush.startsWith('door:');
      const id = p.rightButtonDown() ? 0 : Number(brush.split(':')[1]);
      const layer = isDoor ? this.model().locks?.doors : this.model().locks?.keys;
      const cur = Number(layer?.[key]?.[c.y]?.[c.x] ?? 0) || 0;
      if (cur === id) return;
      store.dispatch((isDoor ? paintDoor : paintKey)({ key, x: c.x, y: c.y, id }));
      return;
    }
    if (brush.startsWith('fog:')) {
      // 迷雾区画笔：右键擦除
      const zone = p.rightButtonDown() ? '.' : brush.slice(4);
      const cur = this.model().fog?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === zone) return;
      store.dispatch(paintFog({ key, x: c.x, y: c.y, zone }));
      return;
    }
    const cls = classify(brush);
    if (cls.kind === 'entity') {
      // 物件画在自己那一层，底下的砖块（比如尖刺）保留；右键只擦物件
      const ch = p.rightButtonDown() ? '.' : brush;
      const cur = this.model().entities?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === ch) return;
      store.dispatch(paintEntity({ key, x: c.x, y: c.y, ch, unique: cls.def.unique }));
      return;
    }
    const ch = p.rightButtonDown() ? '.' : brush;
    if (this.rows()[c.y][c.x] === ch) return;
    store.dispatch(paintCell({ key, x: c.x, y: c.y, ch }));
  }

  /** 文字画笔：左键在这一格放一串新字（内容在侧栏改），右键删掉点到的那串 */
  private placeText(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p), key = this.key();
    if (!c || !key) return;
    const s = this.state(), m = this.model();
    const blocks = m.texts?.[key] ?? [];
    if (p.rightButtonDown()) {
      const hit = blocks.find(b => { const sz = textSize(b.text); return c.x >= b.x && c.y >= b.y && c.x < b.x + sz.w && c.y < b.y + sz.h; });
      if (hit) store.dispatch(removeText({ key, id: hit.id }));
      return;
    }
    const next = s.project.floors[s.floor + 1];
    const target = next ? next.id : nextFloorId(s.project);
    store.dispatch(addText({ key, block: { id: 't' + Date.now().toString(36), x: c.x, y: c.y, text: 'START', tile: '=', target } }));
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
    const ech = (key && this.model().entities?.[key]?.[y]?.[x]) || '.';
    const cls = classify(ech);
    if (cls.kind === 'entity') {
      // 按游戏里的真实尺寸画，以这一格的中心为中心，所见即所得
      const [ox, oy] = cls.def.origin;
      const img = this.add.image(x * T + T * ox, y * T + T * oy, cls.def.texture).setOrigin(ox, oy).setDepth(2.3);
      this.entityImgs.set(k, img);
    }
  }


  private refreshAll(): void {
    const s = this.state();
    this.lastVersion = s.version; this.lastRoomKey = this.key();
    const T = this.T, m = currentModel(s);
    this.grid.clear(); this.grid.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= m.roomW; x++) this.grid.lineBetween(x * T, 0, x * T, m.roomH * T);
    for (let y = 0; y <= m.roomH; y++) this.grid.lineBetween(0, y * T, m.roomW * T, y * T);
    const grid = this.rows().map(r => r.split(''));
    // 文字方块烘进网格：只占空气格，和游戏里一样
    const key = this.key();
    const blocks = key ? m.texts?.[key] ?? [] : [];
    blocks.forEach(b => layoutText(b.text, b.x, b.y).forEach(c => { if (grid[c.y]?.[c.x] === '.') grid[c.y][c.x] = b.tile; }));
    // 门也烘进网格（只占空气格），画完再按组染色
    const doorRows = key ? m.locks?.doors[key] : undefined;
    doorRows?.forEach((row, y) => [...row].forEach((ch, x) => { if (grid[y]?.[x] === '.' && lockGroup(m, Number(ch))) grid[y][x] = DOOR_CHAR; }));
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y, grid);
    doorRows?.forEach((row, y) => [...row].forEach((ch, x) => { const g = lockGroup(m, Number(ch)); const t = g && grid[y]?.[x] === DOOR_CHAR ? this.layer.getTileAt(x, y) : null; if (t) t.tint = g!.color; }));
    this.drawKeys(key ? m.locks?.keys[key] : undefined);
    this.drawTextBlocks(blocks);
    this.drawFogZones();
    this.drawFuse();
    this.updateSupport();
  }

  /** 钥匙：按组染色的小钥匙 */
  private drawKeys(rows: string[] | undefined): void {
    const T = this.T, m = this.model();
    this.keyImgs.forEach(i => i.destroy()); this.keyImgs = [];
    rows?.forEach((row, y) => [...row].forEach((ch, x) => {
      const g = lockGroup(m, Number(ch));
      if (!g) return;
      this.keyImgs.push(this.add.image(x * T + T / 2, y * T + T / 2, 'key').setTint(g.color).setDepth(2.4));
    }));
  }

  /** 每串字画个框 + 目标层标签，编辑时能看出边界 */
  private drawTextBlocks(blocks: { id: string; x: number; y: number; text: string; target: string }[]): void {
    const T = this.T, s = this.state();
    this.textLayer.clear();
    this.textLabels.forEach(t => t.destroy()); this.textLabels = [];
    blocks.forEach(b => {
      const sz = textSize(b.text);
      this.textLayer.lineStyle(2, 0xffd166, 0.9);
      this.textLayer.strokeRect(b.x * T - 2, b.y * T - 2, sz.w * T + 4, sz.h * T + 4);
      const target = s.project.floors.find(f => f.id === b.target);
      const label = this.add.text(b.x * T, b.y * T - 16, '→ ' + (target ? target.name : '?'), { fontSize: '12px', color: '#ffd166', backgroundColor: '#141a2ccc', padding: { x: 3, y: 1 } }).setDepth(2.7);
      this.textLabels.push(label);
    });
  }

  /** 引线层：按四周连接自动拼贴，编辑器里整条线可见（游戏里只有端点）。
   *  掩码用整张大地图算，所以房间边缘的引线会显示成"连到隔壁房间"，而不是端头。 */
  private drawFuse(): void {
    const s = this.state(), m = currentModel(s);
    const rows = fuseRows(m);
    const ox = s.room.rx * m.roomW, oy = s.room.ry * m.roomH;
    FUSE_CHANNELS.forEach((c, i) => {
      const layer = this.fuseTiles[i];
      // 只看这一种颜色：拼贴按同色邻居算，交叉的别的颜色不会被画成连着
      const world = rows.map(r => [...r].map(ch => (fuseHas(ch, c.id) ? 'W' : '.')));
      for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) {
        if (world[oy + y]?.[ox + x] !== 'W') { layer.removeTileAt(x, y); continue; }
        layer.putTileAt(TILE_FRAMES.fuse + Terrain.maskAt(world, ox + x, oy + y), x, y).tint = c.color;
      }
    });
  }

  /** 迷雾区叠加：按区号上色，编辑时能看见，游戏里是黑的 */
  private drawFogZones(): void {
    const T = this.T, s = this.state(), key = this.key();
    this.fogLayer.clear();
    const rows = key ? currentModel(s).fog?.[key] : undefined;
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
    const s = this.state(), T = this.T, m = currentModel(s);
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
