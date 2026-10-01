// ===== 编辑器画布：显示当前房间，左键画、右键擦。侧边栏在 React 里。=====
// 迷雾区画笔不是一格一格画：按住拖出一个矩形，松开整片填上（右键整片擦掉），区大也一下就画完。
import Phaser from 'phaser';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { FUSE_CHANNELS, fuseHas } from '@/game/fuse/channels';
import { DOOR_CHAR, fuseRows, lockGroup, nextFloorId, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { layoutText, textSize } from '@/game/world/font';
import { bridge, EVT, SCENE, type PickedCell } from '@/game/bridge';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { addText, beginStroke, currentModel, paintCell, paintDoor, paintEntity, paintFogRect, paintFuse, paintKey, paintMover, removeText } from '@/redux/slices/editorSlice';
import { canCarry, moverKind } from '@/game/mechanics/mover/kinds';
import { TILE_FRAMES } from '@/asset';
import { FOG_ZONE_COLORS } from '@/game/fog/zones';
import { Colors, hex } from '@/game/palette';

export class EditorScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entityImgs = new Map<string, Phaser.GameObjects.Image>();
  /** 门后面藏着的砖：在门那一格右下角画个小图标（门可以盖在别的砖上，开门后露出来） */
  private hiddenImgs: Phaser.GameObjects.Image[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private fogLayer!: Phaser.GameObjects.Graphics;
  /** 引线：每种颜色一层（白色贴图按颜色染色），交叉的格子两层叠着都看得见 */
  private fuseTiles: Phaser.Tilemaps.TilemapLayer[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  private textLayer!: Phaser.GameObjects.Graphics;
  /** 移动标记：每格画一个双向箭头；底下的砖不能动时画红叉 */
  private moverLayer!: Phaser.GameObjects.Graphics;
  private textLabels: Phaser.GameObjects.Text[] = [];
  private keyImgs: Phaser.GameObjects.Image[] = [];
  private T = 32;
  private lastVersion = -1;
  private lastRoomKey: string | null = null;
  /** 上一次画的时候的显示开关（标出会掉落的格子、显示迷雾区、是不是迷雾画笔）：变了也要重画 */
  private lastView = '';
  /** 瓦片层按建场景时的房间尺寸建的；尺寸变了（改房间尺寸、切到另一种尺寸的层）就重启场景，不能在旧瓦片层上画 */
  private builtSize = { w: 0, h: 0 };
  private restarting = false;
  /** 这一笔是在画布里按下的：从画布外（侧栏、滚动条）按住拖进来不算画 */
  private stroking = false;
  /** 迷雾区画笔正在拖的矩形：按下的格、现在拖到的格、是不是右键（擦） */
  private fogRect: { x0: number; y0: number; x1: number; y1: number; erase: boolean } | null = null;
  private dragLayer!: Phaser.GameObjects.Graphics;

  constructor() { super(SCENE.editor); }

  create(): void {
    const model = currentModel(store.getState().editor);
    this.T = store.getState().config.tile;
    const T = this.T;
    this.builtSize = { w: model.roomW, h: model.roomH };
    this.restarting = false;
    this.stroking = false;
    // 画布 = 一个房间；试玩回来时尺寸可能被游戏场景改过
    resizeGame(this.game, model.roomW * T, model.roomH * T);
    this.cameras.main.setSize(model.roomW * T, model.roomH * T);
    this.cameras.main.setBackgroundColor(hex(Colors.deep));
    this.cameras.main.setScroll(0, 0);

    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: model.roomW, height: model.roomH });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.layer = map.createBlankLayer('room', ts, 0, 0)!;
    this.fuseTiles = FUSE_CHANNELS.map(c => map.createBlankLayer('fuse' + c.id, ts, 0, 0)!.setDepth(2.2 + c.id * 0.01));

    this.grid = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(3);
    this.fogLayer = this.add.graphics().setDepth(2.5);
    this.textLayer = this.add.graphics().setDepth(2.6);
    this.moverLayer = this.add.graphics().setDepth(2.65);
    this.dragLayer = this.add.graphics().setDepth(3.5);
    this.cursor = this.add.rectangle(0, 0, T, T).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4).setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      store.dispatch(beginStroke());   // 按下到松开画的所有格子算一步撤销
      this.stroking = true;
      if (this.state().picking) this.pickStart(p);   // 选试玩起点：不画东西
      else if (this.state().brush === 'text') this.placeText(p);
      else if (this.state().brush.startsWith('fog:')) this.beginFogRect(p);
      else this.paint(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.moveCursor(p);
      if (!this.stroking || !p.isDown || this.state().picking || this.state().brush === 'text') return;
      if (this.fogRect) this.dragFogRect(p); else this.paint(p);
    });
    const endStroke = () => { this.stroking = false; this.endFogRect(); };
    this.input.on('pointerup', endStroke);
    this.input.on('pointerupoutside', endStroke);
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
    if (s.version !== this.lastVersion || this.key() !== this.lastRoomKey || this.viewFlags() !== this.lastView) this.refreshAll();
  }

  private viewFlags(): string { const s = this.state(); return `${s.showSupport}|${s.showFog}|${s.brush.startsWith('fog:')}`; }

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
    this.cursor.setStrokeStyle(this.state().picking ? 3 : 2, this.state().picking ? Colors.mint : 0xffffff, 0.9);   // 选起点时是绿框
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
    if (brush.startsWith('mover:')) {
      // 移动标记：只能画在能动的砖上（实心、自己不会掉）；右键擦掉这一格的任何移动标记
      const kind = moverKind(brush.slice(6));
      const ch = p.rightButtonDown() || !kind ? '.' : kind.ch;
      const cur = this.model().movers?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === ch) return;
      if (ch !== '.' && !canCarry(this.rows()[c.y]?.[c.x])) {
        this.game.events.emit('editor:status', `(${c.x}, ${c.y})  这里的砖不能移动：要实心、自己不会掉的砖（沙土、脆岩、纸不行）`);
        return;
      }
      store.dispatch(paintMover({ key, x: c.x, y: c.y, ch }));
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

  // ---------- 迷雾区：拖矩形 ----------
  /** 按下：记住起点格，先不画 */
  private beginFogRect(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    if (!c) return;
    this.fogRect = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, erase: p.rightButtonDown() };
    this.drawFogRect();
  }

  /** 拖：另一角跟着指针走（拖出画布外就贴在边上），画出预览框 */
  private dragFogRect(p: Phaser.Input.Pointer): void {
    const r = this.fogRect, m = this.model();
    if (!r) return;
    r.x1 = Phaser.Math.Clamp(Math.floor(p.worldX / this.T), 0, m.roomW - 1);
    r.y1 = Phaser.Math.Clamp(Math.floor(p.worldY / this.T), 0, m.roomH - 1);
    this.drawFogRect();
  }

  /** 松开：整个矩形一次填上（或擦掉），一步撤销 */
  private endFogRect(): void {
    const r = this.fogRect, key = this.key();
    this.fogRect = null;
    this.dragLayer.clear();
    if (!r || !key) return;
    const zone = r.erase ? '.' : this.state().brush.slice(4);
    store.dispatch(paintFogRect({ key, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, zone }));
  }

  private drawFogRect(): void {
    const r = this.fogRect, T = this.T, g = this.dragLayer;
    g.clear();
    if (!r) return;
    const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0) + 1, h = Math.abs(r.y1 - r.y0) + 1;
    const zone = this.state().brush.slice(4), color = r.erase ? 0xffffff : FOG_ZONE_COLORS[zone] ?? 0xffffff;
    g.fillStyle(color, r.erase ? 0.15 : 0.3); g.fillRect(x * T, y * T, w * T, h * T);
    g.lineStyle(2, color, 1); g.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    this.game.events.emit('editor:status', `${r.erase ? '擦掉迷雾区' : '迷雾区 ' + zone}：${w} × ${h} 格，松开填上`);
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
    this.lastVersion = s.version; this.lastRoomKey = this.key(); this.lastView = this.viewFlags();
    const T = this.T, m = currentModel(s);
    if (m.roomW !== this.builtSize.w || m.roomH !== this.builtSize.h) {
      if (!this.restarting) { this.restarting = true; this.scene.restart(); }
      return;
    }
    this.grid.clear(); this.grid.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= m.roomW; x++) this.grid.lineBetween(x * T, 0, x * T, m.roomH * T);
    for (let y = 0; y <= m.roomH; y++) this.grid.lineBetween(0, y * T, m.roomW * T, y * T);
    const grid = this.rows().map(r => r.split(''));
    // 文字方块烘进网格：只占空气格，和游戏里一样
    const key = this.key();
    const blocks = key ? m.texts?.[key] ?? [] : [];
    blocks.forEach(b => layoutText(b.text, b.x, b.y).forEach(c => { if (grid[c.y]?.[c.x] === '.') grid[c.y][c.x] = b.tile; }));
    // 门也烘进网格（盖在什么砖上都行，和游戏里一样），画完再按组染色；盖住的砖记下来，右下角画个小图标
    const doorRows = key ? m.locks?.doors[key] : undefined;
    const hidden: { x: number; y: number; id: string }[] = [];
    doorRows?.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!lockGroup(m, Number(ch)) || grid[y]?.[x] === undefined) return;
      if (grid[y][x] !== '.' && grid[y][x] !== DOOR_CHAR) hidden.push({ x, y, id: grid[y][x] });
      grid[y][x] = DOOR_CHAR;
    }));
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y, grid);
    doorRows?.forEach((row, y) => [...row].forEach((ch, x) => { const g = lockGroup(m, Number(ch)); const t = g && grid[y]?.[x] === DOOR_CHAR ? this.layer.getTileAt(x, y) : null; if (t) t.tint = g!.color; }));
    this.hiddenImgs.forEach(i => i.destroy());
    this.hiddenImgs = hidden.map(h => this.add.image(h.x * T + T * 0.74, h.y * T + T * 0.74, 'tiles', Terrain.frameOf(h.id, 'editor')).setScale(0.46).setDepth(2.25));
    this.drawKeys(key ? m.locks?.keys[key] : undefined);
    this.drawTextBlocks(blocks);
    this.drawFogZones();
    this.drawFuse();
    this.drawMovers(grid);
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
      this.textLayer.lineStyle(2, Colors.gold, 0.9);
      this.textLayer.strokeRect(b.x * T - 2, b.y * T - 2, sz.w * T + 4, sz.h * T + 4);
      const target = s.project.floors.find(f => f.id === b.target);
      const label = this.add.text(b.x * T, b.y * T - 16, '→ ' + (target ? target.name : '?'), { fontSize: '12px', color: hex(Colors.gold), backgroundColor: '#141a2ccc', padding: { x: 3, y: 1 } }).setDepth(2.7);
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

  /** 移动标记：按种类画双向箭头（左右 / 上下）；底下的砖不能动（后来换成了沙土之类）画红叉，游戏里会忽略 */
  private drawMovers(grid: string[][]): void {
    const T = this.T, g = this.moverLayer, key = this.key();
    g.clear();
    const rows = key ? this.model().movers?.[key] : undefined;
    rows?.forEach((row, y) => [...row].forEach((ch, x) => {
      const kind = moverKind(ch);
      if (!kind) return;
      const cx = x * T + T / 2, cy = y * T + T / 2, a = T * 0.32, hd = T * 0.14;
      if (!canCarry(grid[y]?.[x])) {
        g.lineStyle(3, Colors.rose, 0.95);
        g.lineBetween(cx - a, cy - a, cx + a, cy + a); g.lineBetween(cx + a, cy - a, cx - a, cy + a);
        return;
      }
      g.fillStyle(Colors.ink, 0.45); g.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
      g.lineStyle(3, kind.color, 1); g.fillStyle(kind.color, 1);
      if (kind.axis === 'x') {
        g.lineBetween(cx - a, cy, cx + a, cy);
        g.fillTriangle(cx - a - hd, cy, cx - a + hd, cy - hd, cx - a + hd, cy + hd);
        g.fillTriangle(cx + a + hd, cy, cx + a - hd, cy - hd, cx + a - hd, cy + hd);
      } else {
        g.lineBetween(cx, cy - a, cx, cy + a);
        g.fillTriangle(cx, cy - a - hd, cx - hd, cy - a + hd, cx + hd, cy - a + hd);
        g.fillTriangle(cx, cy + a + hd, cx - hd, cy + a - hd, cx + hd, cy + a - hd);
      }
    }));
  }

  /**
   * 迷雾区叠加：按区号上色，编辑时能看见，游戏里是黑的。
   * 一片连着的同区格子看成一整块：只淡淡铺色，轮廓只画在和别的区 / 没有迷雾的格子相邻的那几条边上，底下的砖块看得清。
   * 「显示迷雾区」关掉就不画；选着迷雾画笔时不管开关都画（画的时候总要看见）
   */
  private drawFogZones(): void {
    const T = this.T, s = this.state(), key = this.key(), g = this.fogLayer;
    g.clear();
    if (!s.showFog && !s.brush.startsWith('fog:')) return;
    const rows = key ? currentModel(s).fog?.[key] : undefined;
    if (!rows) return;
    const zoneAt = (x: number, y: number) => rows[y]?.[x] ?? '.';
    rows.forEach((row, y) => [...row].forEach((z, x) => {
      const color = FOG_ZONE_COLORS[z];
      if (color === undefined) return;
      g.fillStyle(color, 0.22); g.fillRect(x * T, y * T, T, T);
      g.lineStyle(2, color, 0.95);
      const x0 = x * T, y0 = y * T, x1 = x0 + T, y1 = y0 + T;
      if (zoneAt(x, y - 1) !== z) g.lineBetween(x0, y0 + 1, x1, y0 + 1);
      if (zoneAt(x, y + 1) !== z) g.lineBetween(x0, y1 - 1, x1, y1 - 1);
      if (zoneAt(x - 1, y) !== z) g.lineBetween(x0 + 1, y0, x0 + 1, y1);
      if (zoneAt(x + 1, y) !== z) g.lineBetween(x1 - 1, y0, x1 - 1, y1);
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
