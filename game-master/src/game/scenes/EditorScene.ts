// ===== 编辑器画布：显示当前房间，左键画、右键擦。侧边栏在 React 里。=====
// 砖块、物件之外的画笔（引线、移动方块、钥匙与门、文字、迷雾区……）都是登记的编辑器工具（game/editor/tools.ts）：这里只把点到的格子交给它、按顺序让它们叠加画。
import Phaser from 'phaser';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { bridge, EVT, type PickedCell } from '@/protocol';
import { SCENE } from '@/game/scenes/keys';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { beginStroke, currentFloor, currentModel, paintCell, paintEntity } from '@/redux/slices/editorSlice';
import { Colors, hex } from '@/shared/palette';
import { backgroundDef, backgroundKey } from '@/asset/backgrounds';
import { backgroundOf, coverScale } from '@/game/background/layout';
import { loadBackgrounds } from '@/game/background/Backdrop';
import { DEPTH } from '@/game/depth';
import { EditorTools, toolOf } from '@/game/editor/allTools';
import { isStatus, type EditorHost, type ToolView } from '@/game/editor/tools';

export class EditorScene extends Phaser.Scene {
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entityImgs = new Map<string, Phaser.GameObjects.Image>();
  private overlay!: Phaser.GameObjects.Graphics;
  private cursor!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  /** 各编辑器工具在画布上的那一部分（editor/tools.ts；按物品栏的顺序：文字先烘进网格，门再盖上去） */
  private views: ToolView[] = [];
  private T = 32;
  private lastVersion = -1;
  private lastRoomKey: string | null = null;
  /** 上一次画的时候的显示开关（标出会掉落的格子、显示迷雾区、是不是迷雾画笔）：变了也要重画 */
  private lastView = '';
  /** 现在画着的背景预览（背景 id）和它的那几张图 */
  private shownBackground = '';
  private backgroundImgs: Phaser.GameObjects.Image[] = [];
  /** 瓦片层按建场景时的房间尺寸建的；尺寸变了（改房间尺寸、切到另一种尺寸的层）就重启场景，不能在旧瓦片层上画 */
  private builtSize = { w: 0, h: 0 };
  private restarting = false;
  /** 这一笔是在画布里按下的：从画布外（侧栏、滚动条）按住拖进来不算画 */
  private stroking = false;
  /** 拖矩形的工具正在拖的矩形：按下的格、现在拖到的格、是不是右键（擦） */
  private dragRect: { x0: number; y0: number; x1: number; y1: number; erase: boolean } | null = null;
  private dragLayer!: Phaser.GameObjects.Graphics;

  constructor() { super(SCENE.editor); }

  create(): void {
    const model = currentModel(store.getState().editor);
    this.T = store.getState().config.tile;
    const T = this.T;
    this.builtSize = { w: model.roomW, h: model.roomH };
    this.restarting = false;
    this.stroking = false;
    this.shownBackground = ''; this.backgroundImgs = [];   // 场景重开：旧的图跟着场景没了
    // 画布 = 一个房间；试玩回来时尺寸可能被游戏场景改过
    resizeGame(this.game, model.roomW * T, model.roomH * T);
    this.cameras.main.setSize(model.roomW * T, model.roomH * T);
    this.cameras.main.setBackgroundColor(hex(Colors.deep));
    this.cameras.main.setScroll(0, 0);

    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: model.roomW, height: model.roomH });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.layer = map.createBlankLayer('room', ts, 0, 0)!;

    this.grid = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(3);
    this.dragLayer = this.add.graphics().setDepth(3.5);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 工具读场景的当前值
    const scene = this;
    const host: EditorHost = {
      scene: this, T, tiles: this.layer, map, tileset: ts,
      model: () => scene.model(), state: () => scene.state(), key: () => scene.key(),
    };
    this.views = [...EditorTools.list()].sort((a, b) => a.order - b.order).flatMap(t => (t.create ? [t.create(host)] : []));
    this.cursor = this.add.rectangle(0, 0, T, T).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4).setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      store.dispatch(beginStroke());   // 按下到松开画的所有格子算一步撤销
      this.stroking = true;
      const stroke = toolOf(this.state().brush)?.stroke ?? 'cell';
      if (this.state().picking) this.pickStart(p);   // 选试玩起点：不画东西
      else if (stroke === 'rect') this.beginRect(p);
      else this.paint(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.moveCursor(p);
      if (!this.stroking || !p.isDown || this.state().picking || toolOf(this.state().brush)?.stroke === 'click') return;
      if (this.dragRect) this.dragTo(p); else this.paint(p);
    });
    const endStroke = () => { this.stroking = false; this.endRect(); };
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

  /** 显示开关（标出会掉落的格子、各工具自己的开关）：变了也要重画 */
  private viewFlags(): string { const s = this.state(); return [s.showSupport, ...EditorTools.list().map(t => t.viewKey?.(s) ?? '')].join('|'); }

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

  /** 点到的这一格交给它的工具（引线、移动方块、钥匙与门……）；砖块和物件是核心的两种，自己画 */
  private paint(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p), key = this.key();
    if (!c || !key) return;
    const s = this.state(), brush = s.brush, erase = p.rightButtonDown(), tool = toolOf(brush);
    if (tool) {
      const r = tool.paint?.({ model: this.model(), state: s, key, x: c.x, y: c.y, brush, erase }) ?? null;
      if (isStatus(r)) this.game.events.emit('editor:status', r.status);
      else if (r) store.dispatch(r);
      return;
    }
    const cls = classify(brush);
    if (cls.kind === 'entity') {
      // 物件画在自己那一层，底下的砖块（比如尖刺）保留；右键只擦物件
      const ch = erase ? '.' : brush;
      const cur = this.model().entities?.[key]?.[c.y]?.[c.x] ?? '.';
      if (cur === ch) return;
      store.dispatch(paintEntity({ key, x: c.x, y: c.y, ch, unique: cls.def.unique }));
      return;
    }
    const ch = erase ? '.' : brush;
    if (this.rows()[c.y][c.x] === ch) return;
    store.dispatch(paintCell({ key, x: c.x, y: c.y, ch }));
  }

  // ---------- 拖矩形的工具（迷雾区）：按下记住起点，拖着画预览框，松开整片一次填上 ----------
  private beginRect(p: Phaser.Input.Pointer): void {
    const c = this.cellAt(p);
    if (!c) return;
    this.dragRect = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, erase: p.rightButtonDown() };
    this.drawRect();
  }

  /** 拖：另一角跟着指针走（拖出画布外就贴在边上） */
  private dragTo(p: Phaser.Input.Pointer): void {
    const r = this.dragRect, m = this.model();
    if (!r) return;
    r.x1 = Phaser.Math.Clamp(Math.floor(p.worldX / this.T), 0, m.roomW - 1);
    r.y1 = Phaser.Math.Clamp(Math.floor(p.worldY / this.T), 0, m.roomH - 1);
    this.drawRect();
  }

  /** 松开：整个矩形一次填上（或擦掉），一步撤销 */
  private endRect(): void {
    const r = this.dragRect, key = this.key(), s = this.state(), tool = toolOf(s.brush);
    this.dragRect = null;
    this.dragLayer.clear();
    if (!r || !key || !tool?.paintRect) return;
    const action = tool.paintRect({ model: this.model(), state: s, key, brush: s.brush, erase: r.erase, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
    if (action) store.dispatch(action);
  }

  private drawRect(): void {
    const r = this.dragRect, T = this.T, g = this.dragLayer, brush = this.state().brush;
    g.clear();
    if (!r) return;
    const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0) + 1, h = Math.abs(r.y1 - r.y0) + 1;
    const color = toolOf(brush)?.rectColor?.(brush, r.erase) ?? 0xffffff;
    g.fillStyle(color, r.erase ? 0.15 : 0.3); g.fillRect(x * T, y * T, w * T, h * T);
    g.lineStyle(2, color, 1); g.strokeRect(x * T + 1, y * T + 1, w * T - 2, h * T - 2);
    this.game.events.emit('editor:status', `${r.erase ? '擦掉' : '填上'}：${w} × ${h} 格，松开生效`);
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


  /** 背景预览：这个房间用的背景（跟游戏里一样的取法），按房间正中、不带视差画在网格下面；默认的星空就是纯色底 */
  private refreshBackground(): void {
    const key = this.key(), floor = currentFloor(this.state());
    const id = key ? backgroundOf(floor, floor.model, key) : '';
    if (id === this.shownBackground) return;
    this.shownBackground = id;
    this.backgroundImgs.forEach(i => i.destroy()); this.backgroundImgs = [];
    const def = backgroundDef(id);
    if (!key || !def.layers.length) return;
    loadBackgrounds(this, [id], () => {
      if (this.shownBackground !== id || !this.sys.isActive()) return;
      const W = floor.model.roomW * this.T, H = floor.model.roomH * this.T;
      def.layers.forEach((layer, i) => {
        const tk = backgroundKey(layer.file);
        if (!this.textures.exists(tk)) return;
        const tex = this.textures.get(tk);
        tex.setFilter(def.pixelated ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        const src = tex.getSourceImage() as { width: number; height: number };
        this.backgroundImgs.push(this.add.image(W / 2, H / 2, tk).setScale(coverScale(src.width, src.height, W, H, layer)).setAlpha(layer.alpha ?? 1).setDepth(DEPTH.background + i * DEPTH.backgroundStep));
      });
    });
  }

  private refreshAll(): void {
    const s = this.state();
    this.lastVersion = s.version; this.lastRoomKey = this.key(); this.lastView = this.viewFlags();
    const T = this.T, m = currentModel(s);
    if (m.roomW !== this.builtSize.w || m.roomH !== this.builtSize.h) {
      if (!this.restarting) { this.restarting = true; this.scene.restart(); }
      return;
    }
    this.refreshBackground();
    this.grid.clear(); this.grid.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= m.roomW; x++) this.grid.lineBetween(x * T, 0, x * T, m.roomH * T);
    for (let y = 0; y <= m.roomH; y++) this.grid.lineBetween(0, y * T, m.roomW * T, y * T);
    // 各工具先改网格（文字方块、门烘进砖块，和游戏里一样），再画砖块，最后各自叠加
    const grid = this.rows().map(r => r.split(''));
    this.views.forEach(v => v.prepareGrid?.(grid));
    for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) this.refreshCell(x, y, grid);
    this.views.forEach(v => v.draw(grid));
    this.updateSupport();
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
