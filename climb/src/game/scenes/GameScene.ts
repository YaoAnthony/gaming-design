// ===== 游戏场景：房间制世界、起跳爆炸、怪物、危险格、存档 =====
import Phaser from 'phaser';
import type { CellRef, EnemySpawn, EntityHost, EntryState, FogState, GameConfig, ItemDef, ItemSpawn, NpcSpawn, Point, Project, RoomCoord, SkillContext, SkillDef, SliderSpawn, TextBlock, WorldModel } from '@/type';
import { classify, Items, Skills, Tiles } from '@/game/registry/registry';
import { Terrain, type Chunk } from '@/game/terrain/Terrain';
import { bakeTexts, entityRows, floorAfter, floorIndex, fogRows, fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { Player, Enemy, CarriedPaper, TopPlatform, Boss, SparkBurst, type JumpEvent } from '@/sprite';
import { createSparkEmitter, playCrush, playExplosion, playLand, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { touch, TOUCH_JUMP } from '@/game/input';
import { Music } from '@/game/Music';
import { flash, setBoss, setDialogue, setMode, setRoomKey, setStats } from '@/redux/slices/hudSlice';
import { setConfig } from '@/redux/slices/configSlice';

interface Slider { spawn: SliderSpawn; x0: number; x1: number; y: number; knob: Phaser.GameObjects.Rectangle; waves: Phaser.GameObjects.Graphics; value: number }

interface Npc { spawn: NpcSpawn; sprite: Phaser.Physics.Arcade.Image; index: number; done: boolean }
import { writeSave } from '@/redux/slices/saveSlice';

export class GameScene extends Phaser.Scene implements EntityHost {
  private cfg!: GameConfig;
  private project!: Project;
  private floorId = '';
  /** 当前层的模型（文字方块已烘焙成砖） */
  private model!: WorldModel;
  /** 文字方块：全部格子都被炸掉就跳到目标层 */
  private textBlocks: { block: TextBlock; cells: CellRef[]; done: boolean }[] = [];
  private portals: Point[] = [];
  /** 会说话的角色；talking = 正在对话的那个（期间左右移动锁住，跳一下说下一句） */
  private npcs: Npc[] = [];
  private npcBodies!: Phaser.Physics.Arcade.StaticGroup;
  private talking: Npc | null = null;
  /** 地上的道具 */
  private groundItems: { spawn: ItemSpawn; sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image }[] = [];
  /** 身上带着的道具 → 手上的贴图（和光晕）*/
  private held = new Map<string, { sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }>();
  private heldIds: string[] = [];
  /** 设置房间里的滑块 */
  private sliders: Slider[] = [];
  private announceFloor = false;
  /** 正在切层（淡出中），不再响应输入 */
  private leaving = false;
  private playtest = false;
  private startRoom: RoomCoord | null = null;
  private savedRows: string[] | null = null;
  private savedEntry: EntryState | null = null;
  private savedFog: FogState | null = null;
  private fog: FogOfWar | null = null;
  private fuses!: FuseNet;
  private savedFuse: string[] | null = null;
  private fogTile = { x: -1, y: -1 };
  private fogDirty = true;

  private terrain!: Terrain;
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private carried: CarriedPaper[] = [];
  private carriedGroup!: Phaser.Physics.Arcade.Group;
  /** 下落中还能站的碎块（纸）对应的物理平台 */
  private fallingPlatforms = new Map<number, TopPlatform>();
  private music!: Music;
  private boss: Boss | null = null;
  /** Boss 和地形的碰撞器，必须随 Boss 一起销毁：留着会每帧去碰一个没有物理体的对象，把物理循环炸掉 */
  private bossCollider: Phaser.Physics.Arcade.Collider | null = null;
  private bossRoom: RoomCoord | null = null;
  private bossDoors: CellRef[] = [];
  /** 还没封上的门（等玩家离开门口再封） */
  private bossDoorsPending: CellRef[] = [];
  private bossDefeated = new Set<string>();
  /** 封门时的位置：打赢之后死了就回到这里 */
  private bossSealEntry: EntryState | null = null;
  /** 打赢的 Boss：复活点（封门处）、倒下的位置。之后任何一次重置 Boss 房，都从这里重演一次炸开：引线重新点、路重新开 */
  private bossWon: { entry: EntryState; at: Point } | null = null;
  private bossSpawns: EnemySpawn[] = [];
  private bursts: SparkBurst[] = [];
  private sparks!: SparkEmitter;
  private preview!: Phaser.GameObjects.Graphics;
  private skill!: SkillDef;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'A' | 'D', Phaser.Input.Keyboard.Key>;

  spawnPoints: Point[] = [];
  private enemySpawns: EnemySpawn[] = [];
  private goal: Point | null = null;

  private roomW = 20; private roomH = 20; private roomPxW = 640; private roomPxH = 640;
  private room: RoomCoord = { rx: 0, ry: 0 };
  private entry: EntryState = { x: 0, y: 0, vx: 0, vy: 0 };
  private prevEntry: EntryState | null = null;
  private lastResetAt: number | null = null;

  private dead = false; private won = false;
  private jumps = 0; private destroyed = 0;

  constructor() { super(SCENE.game); }

  init(data: StartGameData): void {
    this.project = data.project;
    const floor = (data.floorId && this.project.floors.find(f => f.id === data.floorId)) || this.project.floors[0];
    this.floorId = floor.id;
    const baked = bakeTexts(floor.model);
    this.model = baked.model;
    this.textBlocks = baked.blocks.filter(b => b.cells.length > 0).map(b => ({ block: b.block, cells: b.cells, done: false }));
    this.portals = []; this.npcs = []; this.talking = null;
    this.groundItems = []; this.held = new Map(); this.heldIds = data.items ?? [];
    this.sliders = [];
    this.announceFloor = !!data.announceFloor;
    this.leaving = false;
    this.playtest = !!data.playtest;
    this.startRoom = data.startRoom ?? null;
    this.savedRows = data.rows ?? null;
    this.savedEntry = data.entry ?? null;
    this.savedFog = data.fog ?? null;
    this.savedFuse = data.fuse ?? null;
    this.fog = null; this.fogTile = { x: -1, y: -1 }; this.fogDirty = true;
    this.jumps = data.stats?.jumps ?? 0;
    this.destroyed = data.stats?.destroyed ?? 0;
    this.dead = false; this.won = false; this.prevEntry = null; this.lastResetAt = null;
    this.spawnPoints = []; this.enemySpawns = []; this.bossSpawns = []; this.goal = null;
    this.bossDefeated.clear(); this.bossSealEntry = null; this.bossWon = null; this.bossKey = null;
  }

  create(): void {
    this.cfg = store.getState().config;
    this.skill = Skills.get(this.cfg.skill) ?? Skills.list()[0];
    const T = this.cfg.tile;
    this.roomW = this.model.roomW; this.roomH = this.model.roomH;
    this.roomPxW = this.roomW * T; this.roomPxH = this.roomH * T;
    // 画布 = 一个房间；每层房间尺寸可以不同，换层时跟着改
    resizeGame(this.game, this.roomPxW, this.roomPxH);
    this.cameras.main.setSize(this.roomPxW, this.roomPxH);
    this.cameras.main.setZoom(1).setRotation(0);

    const rows = worldRows(this.model);
    // 读档时用存档里的格子状态，但"原始状态"仍是地图本身（R 重置用）
    this.terrain = new Terrain({
      scene: this,
      onChunkFall: ch => this.onChunkFall(ch),
      onChunkLand: ch => this.onChunkLand(ch),
      catchChunk: ch => this.catchChunk(ch),
    }, rows, { tile: T, explosionRadius: this.cfg.explosionRadius, chunkGravity: this.cfg.chunkGravity, chunkMaxFall: this.cfg.chunkMaxFall });
    if (this.savedRows && this.savedRows.length === rows.length) {
      this.savedRows.forEach((r, y) => [...r].forEach((c, x) => { if (this.terrain.grid[y][x] !== c && (c === '.' || this.terrain.def(0, 0) !== undefined)) this.terrain.set(x, y, c); }));
    }
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    this.physics.world.gravity.y = this.cfg.gravity;

    this.buildBackground(levelW, levelH);
    this.fuses = new FuseNet(this, fuseRows(this.model), { tile: T, delayMs: this.cfg.fuseDelayMs }, this.savedFuse ?? undefined);

    // 迷雾按房间开启：只要有一个房间开了就建迷雾层，其余房间全亮
    const fogRooms = new Set(Object.entries(this.model.roomFlags ?? {}).filter(([, f]) => f.fog).map(([k]) => k));
    if (fogRooms.size) {
      const noFog = new Set(Object.keys(this.model.rooms).filter(k => !fogRooms.has(k)));
      this.fog = new FogOfWar(this, this.terrain.grid, fogRows(this.model).map(r => r.split('')), {
        tile: T, roomW: this.roomW, roomH: this.roomH, radius: this.cfg.fogRadius, memoryAlpha: this.cfg.fogMemoryAlpha,
        keyAt: (rx, ry) => roomKeyAt(this.model, rx, ry), noFogRooms: noFog,
      }, this.savedFog ?? undefined);
    }

    // 怪物组先建好，物件 spawn 时会用到
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false });
    this.physics.add.collider(this.enemies, this.terrain.layer);
    this.carried = [];
    this.fallingPlatforms = new Map();
    this.carriedGroup = this.physics.add.group({ allowGravity: false, immovable: true });
    this.npcBodies = this.physics.add.staticGroup();

    // 物件层：每个字符问注册表，由物件自己决定怎么进场
    entityRows(this.model).forEach((row, y) => [...row].forEach((c, x) => {
      const cls = classify(c);
      if (cls.kind !== 'entity') return;
      cls.def.spawn({ host: this, wx: x * T + T / 2, wy: y * T + T / 2, cell: { x, y, rx: Math.floor(x / this.roomW), ry: Math.floor(y / this.roomH) } });
    }));

    // 出生点：读档入口 > 指定起始房间（里面的出生点，否则找个能站的地方）> 全图出生点 > 兜底
    let start: Point | null = this.savedEntry;
    if (!start && this.startRoom) {
      start = this.spawnPoints.find(p => this.sameRoom(this.roomOf(p.x, p.y), this.startRoom!)) ?? this.standingSpot(this.startRoom);
    }
    if (!start) start = this.spawnPoints[0] ?? null;
    if (!start) start = { x: 2 * T, y: 4 * T };

    this.player = new Player(this, start.x, start.y, this.cfg);
    if (this.savedEntry) this.player.setVelocity(this.savedEntry.vx, this.savedEntry.vy);
    this.physics.add.collider(this.player, this.terrain.layer);
    this.physics.add.collider(this.player, this.carriedGroup);
    this.physics.add.collider(this.player, this.npcBodies);
    this.heldIds.forEach(id => { const def = Items.get(id); if (def) this.hold(def); });

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);
    if (this.roomFlagBoss(this.room)) this.startBoss(this.room);

    // 输入
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D' }) as Record<'A' | 'D', Phaser.Input.Keyboard.Key>;
    const press = () => { if (this.won) this.continueAfterWin(); else this.player.pressJump(this.time.now); };
    kb.on('keydown-SPACE', press); kb.on('keydown-UP', press); kb.on('keydown-W', press);
    bridge.on(TOUCH_JUMP, press);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { bridge.off(TOUCH_JUMP, press); touch.left = false; touch.right = false; });
    kb.on('keydown-R', () => { if (this.won) return; if (this.dead) this.resetAfterDeath(); else this.resetRoom(); });
    const requestReset = () => { if (this.dead && !this.won) this.resetAfterDeath(); };
    const continueGame = () => { if (this.won) this.continueAfterWin(); };
    bridge.on(EVT.requestReset, requestReset); bridge.on(EVT.continueGame, continueGame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { bridge.off(EVT.requestReset, requestReset); bridge.off(EVT.continueGame, continueGame); });
    if (this.playtest) kb.on('keydown-ESC', () => this.exitPlaytest());

    this.preview = this.add.graphics().setDepth(8);
    this.sparks = createSparkEmitter(this);

    this.music = new Music(this, this.cfg.musicVolume);
    this.music.play('bgm');
    let lastVol = this.cfg.musicVolume;
    const unsubVol = store.subscribe(() => { const v = store.getState().config.musicVolume; if (v !== lastVol) { lastVol = v; this.music.setVolume(v); } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubVol);
    if (this.announceFloor) {
      this.cameras.main.fadeIn(350, 0, 0, 0);
      const floor = this.project.floors.find(f => f.id === this.floorId);
      if (floor) this.flash(floor.name, '#ffd166');
    }
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.music.stop(); store.dispatch(setMode({ mode: 'idle' })); store.dispatch(setBoss(null)); store.dispatch(setDialogue(null)); });
  }

  // ---------- EntityHost ----------
  addEnemy(spawn: EnemySpawn): void { this.enemySpawns.push(spawn); this.spawnEnemy(spawn); }
  addBoss(spawn: EnemySpawn): void { this.bossSpawns.push(spawn); }
  addPortal(p: Point): void {
    this.portals.push(p);
    this.add.image(p.x, p.y + this.cfg.tile / 2, 'castle').setOrigin(0.5, 1).setDepth(1.5);
  }
  addItem(spawn: ItemSpawn): void {
    if (this.heldIds.includes(spawn.item.id)) return;   // 已经拿着了，地上不再放
    const sprite = this.add.image(spawn.x, spawn.y + this.cfg.tile / 2, spawn.item.texture).setOrigin(0.5, 1).setDepth(2.4);
    this.tweens.add({ targets: sprite, y: sprite.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    let glow: Phaser.GameObjects.Image | undefined;
    if (spawn.item.light > 0) {
      // 地上就亮着，远远看见，勾着人过去
      glow = this.add.image(spawn.x, spawn.y, 'fogglow').setDepth(2.35).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(1.5);
      this.tweens.add({ targets: glow, alpha: 0.45, scale: 1.75, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.groundItems.push({ spawn, sprite, glow });
    this.syncLightSources();
  }
  /** 地上会发光的道具都是迷雾里的光源 */
  private syncLightSources(): void {
    const T = this.cfg.tile;
    this.fog?.setSources(this.groundItems.filter(g => g.spawn.item.light > 0).map(g => ({ x: Math.floor(g.spawn.x / T), y: Math.floor(g.spawn.y / T), r: g.spawn.item.light })));
    this.fogDirty = true;
  }

  // ---------- 道具 ----------
  /** 碰到就捡 */
  private checkItems(): void {
    if (!this.groundItems.length) return;
    const r = this.player.rect();
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const g = this.groundItems[i];
      if (!Phaser.Geom.Intersects.RectangleToRectangle(g.sprite.getBounds(), r)) continue;
      this.groundItems.splice(i, 1);
      g.sprite.destroy(); g.glow?.destroy();
      this.syncLightSources();
      this.hold(g.spawn.item);
      this.sparks.explode(8, g.spawn.x, g.spawn.y);
      if (!this.playtest) this.autosave();
    }
  }
  /** 拿在右手上；有照明的道具顺便把迷雾半径撑开 */
  private hold(def: ItemDef): void {
    if (this.held.has(def.id)) return;
    if (!this.heldIds.includes(def.id)) this.heldIds.push(def.id);
    const sprite = this.add.image(0, 0, def.texture).setOrigin(0.5, 1).setDepth(10.5);
    const glow = this.add.image(0, 0, 'fogglow').setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(def.light > 0 ? 0.28 : 0).setScale(1.4);
    if (def.light > 0) this.tweens.add({ targets: glow, alpha: 0.42, scale: 1.6, duration: 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.held.set(def.id, { sprite, glow });
    this.placeHeld();
    this.fog?.setRadius(this.lightRadius()); this.fogDirty = true;
  }
  private lightRadius(): number {
    return Math.max(this.cfg.fogRadius, ...[...this.held.keys()].map(id => Items.get(id)?.light ?? 0));
  }
  /** 手上的东西跟着人走：右手 = 面朝方向那一侧 */
  private placeHeld(): void {
    if (!this.held.size) return;
    const side = this.player.flipX ? -1 : 1, b = this.player.body;
    let k = 0;
    this.held.forEach(({ sprite, glow }) => {
      const x = b.center.x + side * (13 + k * 6), y = b.center.y + 8;
      sprite.setPosition(x, y).setFlipX(side < 0);
      glow.setPosition(x, y - sprite.height / 2);
      k++;
    });
  }

  // ---------- 滑块 ----------
  addSlider(spawn: SliderSpawn): void {
    const T = this.cfg.tile;
    const floor = spawn.y + T / 2;
    this.add.image(spawn.x, floor - 4, 'volume').setOrigin(0.5, 1).setDepth(2.4);
    const x0 = spawn.x + T * 0.9, x1 = spawn.x + spawn.length * T, y = floor - 12;
    const rail = this.add.graphics().setDepth(2.3);
    rail.lineStyle(6, 0x0b0b14, 0.9); rail.lineBetween(x0, y, x1, y);
    rail.lineStyle(2, 0x9aa0b4, 0.9); rail.lineBetween(x0, y, x1, y);
    for (let i = 0; i <= 4; i++) { const tx = x0 + (x1 - x0) * i / 4; rail.lineStyle(2, 0x9aa0b4, 0.6); rail.lineBetween(tx, y - 6, tx, y + 6); }
    const knob = this.add.rectangle(x0, y, 14, 24, 0xffd166).setStrokeStyle(2, 0x0b0b14).setDepth(2.6);
    const waves = this.add.graphics().setDepth(2.5);
    const s: Slider = { spawn, x0, x1, y, knob, waves, value: NaN };
    this.sliders.push(s);
    this.syncSlider(s, store.getState().config[spawn.config]);
  }
  /** 数值 → 滑钮位置 + 喇叭旁的声波 */
  private syncSlider(s: Slider, value: number): void {
    if (value === s.value) return;
    s.value = value;
    const t = (value - s.spawn.min) / (s.spawn.max - s.spawn.min);
    s.knob.x = s.x0 + (s.x1 - s.x0) * Phaser.Math.Clamp(t, 0, 1);
    const g = s.waves, cx = s.spawn.x + 10, cy = s.y - 4;
    g.clear();
    if (t <= 0) { g.lineStyle(2, 0xef476f, 0.9); g.lineBetween(cx + 4, cy - 5, cx + 12, cy + 5); g.lineBetween(cx + 12, cy - 5, cx + 4, cy + 5); return; }
    const n = t < 0.34 ? 1 : t < 0.67 ? 2 : 3;
    g.lineStyle(2, 0xffd166, 0.9);
    for (let i = 1; i <= n; i++) g.beginPath(), g.arc(cx, cy, 5 + i * 5, -0.9, 0.9, false), g.strokePath();
  }
  /** 人走进滑钮就把它推着走；停在哪儿，设置就是多少 */
  private updateSliders(): void {
    if (!this.sliders.length) return;
    const b = this.player.body;
    this.sliders.forEach(s => {
      // 别处改了设置（比如读档），滑钮跟过去
      this.syncSlider(s, store.getState().config[s.spawn.config]);
      const half = 7, kx = s.knob.x;
      if (b.bottom <= s.y - 12 || b.top >= s.y + 12) return;
      if (b.right <= kx - half || b.left >= kx + half) return;
      const nx = Phaser.Math.Clamp(b.center.x < kx ? b.right + half : b.left - half, s.x0, s.x1);
      if (nx === kx) return;
      const t = (nx - s.x0) / (s.x1 - s.x0);
      const value = Math.round((s.spawn.min + (s.spawn.max - s.spawn.min) * t) * 100) / 100;
      store.dispatch(setConfig({ [s.spawn.config]: value }));
      this.syncSlider(s, value);
      s.knob.x = nx;
    });
  }

  addNpc(spawn: NpcSpawn): void {
    const sprite = this.npcBodies.create(spawn.x, spawn.y + this.cfg.tile / 2, spawn.texture) as Phaser.Physics.Arcade.Image;
    sprite.setOrigin(0.5, 1).setDepth(2.5).refreshBody();
    this.npcs.push({ spawn, sprite, index: 0, done: false });
  }

  // ---------- 对话 ----------
  /** 走到角色跟前（一格半内）就开始说话 */
  private checkNpcs(): void {
    if (this.talking) return;
    const T = this.cfg.tile, p = this.player.body;
    const npc = this.npcs.find(n => !n.done && Math.abs(p.center.x - n.sprite.x) < 1.5 * T && Math.abs(p.bottom - n.sprite.y) < 2 * T);
    if (!npc) return;
    this.talking = npc; npc.index = 0;
    this.showLine();
  }
  private showLine(): void {
    const n = this.talking; if (!n) return;
    const line = n.spawn.lines[n.index];
    store.dispatch(setDialogue({ speaker: n.spawn.name, text: line.text, avatar: line.avatar ?? n.spawn.avatar, index: n.index, total: n.spawn.lines.length }));
  }
  /** 每跳一次说下一句；最后一句说完再跳，角色带着笑声淡出 */
  private advanceDialogue(): void {
    const n = this.talking; if (!n) return;
    n.index++;
    if (n.index < n.spawn.lines.length) { this.showLine(); return; }
    n.done = true; this.talking = null;
    store.dispatch(setDialogue(null));
    if (n.spawn.sound && this.cache.audio.exists(n.spawn.sound)) this.sound.play(n.spawn.sound, { volume: 0.9 });
    (n.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.tweens.add({ targets: n.sprite, alpha: 0, y: n.sprite.y - 6, duration: 1400, ease: 'Sine.in', onComplete: () => n.sprite.destroy() });
  }
  private endDialogue(): void {
    if (!this.talking) return;
    this.talking.index = 0; this.talking = null;
    store.dispatch(setDialogue(null));
  }
  setGoal(p: Point): void {
    this.goal = p;
    this.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.cfg.tile / 2);
  }

  /** 在房间里找一个"脚下是实心、头顶两格是空气"的位置：离房间入口（边上的缺口）最近的那个，没有缺口就离中心最近；找不到就房间中央 */
  private standingSpot(r: RoomCoord): Point {
    const T = this.cfg.tile, x0 = r.rx * this.roomW, y0 = r.ry * this.roomH;
    const cx = x0 + this.roomW / 2, cy = y0 + this.roomH / 2;
    const openings: CellRef[] = [];
    for (let y = y0 + 1; y < y0 + this.roomH - 1; y++) for (const x of [x0, x0 + this.roomW - 1]) if (!this.terrain.isSolid(x, y)) openings.push({ x, y });
    for (let x = x0 + 1; x < x0 + this.roomW - 1; x++) for (const y of [y0, y0 + this.roomH - 1]) if (!this.terrain.isSolid(x, y)) openings.push({ x, y });
    const anchors = openings.length ? openings : [{ x: cx, y: cy }];
    let best: CellRef | null = null, bestD = Infinity;
    for (let y = y0 + 1; y < y0 + this.roomH - 1; y++)
      for (let x = x0 + 1; x < x0 + this.roomW - 1; x++) {
        if (this.terrain.isSolid(x, y) || this.terrain.isSolid(x, y - 1) || !this.terrain.isSolid(x, y + 1)) continue;
        if (this.terrain.def(x, y).hazard) continue;
        const d = Math.min(...anchors.map(a => (x + 0.5 - a.x) ** 2 + (y + 0.5 - a.y) ** 2));
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    if (!best) return { x: cx * T, y: (y0 + this.roomH * 0.3) * T };
    return { x: best.x * T + T / 2, y: best.y * T + T - 19 };   // 脚贴着地面
  }

  // ---------- 房间 ----------
  private roomOf(x: number, y: number): RoomCoord { return { rx: Math.floor(x / this.roomPxW), ry: Math.floor(y / this.roomPxH) }; }
  private sameRoom(a: RoomCoord, b: RoomCoord): boolean { return a.rx === b.rx && a.ry === b.ry; }

  private enterRoom(r: RoomCoord, instant: boolean): void {
    this.room = r;
    this.fog?.setRoom(r);
    const sx = r.rx * this.roomPxW, sy = r.ry * this.roomPxH;
    this.tweens.killTweensOf(this.cameras.main);
    if (instant) this.cameras.main.setScroll(sx, sy);
    else this.tweens.add({ targets: this.cameras.main, scrollX: sx, scrollY: sy, duration: this.cfg.roomPanMs, ease: 'Sine.out' });
    const key = roomKeyAt(this.model, r.rx, r.ry);
    store.dispatch(setRoomKey(key ?? '?'));
  }

  // ---------- Boss ----------
  /** 这个房间有没有 Boss（放了 Boss 物件，或旧的房间开关），且还没被打败 */
  private roomFlagBoss(r: RoomCoord): boolean {
    const key = roomKeyAt(this.model, r.rx, r.ry);
    if (!key || this.bossDefeated.has(key)) return false;
    return this.bossSpawns.some(sp => this.sameRoom(sp, r)) || !!this.model.roomFlags?.[key]?.boss;
  }

  /** 玩家进 Boss 房：先不出 Boss，只记下要封的门，等玩家走进来一点再封门、再出场 */
  private startBoss(r: RoomCoord): void {
    const x0 = r.rx * this.roomW, y0 = r.ry * this.roomH;
    this.bossRoom = r;
    this.bossDoors = []; this.bossDoorsPending = [];
    for (let y = y0; y < y0 + this.roomH; y++) for (const x of [x0, x0 + this.roomW - 1]) {
      if (!this.terrain.isSolid(x, y)) this.bossDoorsPending.push({ x, y });
    }
  }

  /** 门关上之后 Boss 才从放物件的位置落下 */
  private spawnBoss(r: RoomCoord): void {
    const T = this.cfg.tile, x0 = r.rx * this.roomW, y0 = r.ry * this.roomH;
    const sp = this.bossSpawns.find(b => this.sameRoom(b, r));
    const bx = sp ? sp.x : (x0 + this.roomW / 2) * T, by = sp ? sp.y : (y0 + 1.5) * T;
    this.boss = new Boss(this, bx, by, { hp: this.cfg.bossHp, hopMs: this.cfg.bossHopMs, spitMs: this.cfg.bossSpitMs, tile: T });
    this.bossCollider = this.physics.add.collider(this.boss, this.terrain.layer);
    store.dispatch(setBoss({ hp: this.boss.hp, max: this.boss.maxHp }));
    this.music.play('bossMusic');
    this.cameras.main.shake(300, 0.012);
    this.flash('大史莱姆！', '#9b5de5');
    this.fogDirty = true;
  }

  /** 玩家离门口一格半以上就把门封上 */
  private sealBossDoors(): void {
    if (!this.bossDoorsPending.length) return;
    const T = this.cfg.tile, b = this.player.body;
    const clear = this.bossDoorsPending.every(c => {
      const cx = c.x * T + T / 2, cy = c.y * T + T / 2;
      return Math.abs(b.center.x - cx) > 1.5 * T || Math.abs(b.center.y - cy) > 1.5 * T;
    });
    if (!clear) return;
    this.bossDoorsPending.forEach(c => { this.bossDoors.push(c); this.terrain.set(c.x, c.y, 'R'); });
    this.bossDoorsPending = [];
    this.cameras.main.shake(120, 0.005);
    this.fogDirty = true;
    // 复活点就定在关门的这个位置
    this.entry = { x: this.player.x, y: this.player.y, vx: 0, vy: 0 };
    this.bossSealEntry = this.entry;
    if (this.bossRoom) this.time.delayedCall(350, () => { if (this.bossRoom && !this.boss && this.bossDoors.length) this.spawnBoss(this.bossRoom); });
  }

  /** 打赢过的 Boss 房的 key */
  private bossKey: string | null = null;
  private inBossRoom(r: RoomCoord): boolean { return !!this.bossWon && this.sameRoom(this.roomOf(this.bossWon.entry.x, this.bossWon.entry.y), r); }
  /** 当作没打过：Boss 会在下次进房 / 重置时回来 */
  private forgetBossWin(): void { this.bossWon = null; this.bossKey = null; this.bossDefeated.clear(); }

  private endBoss(defeated: boolean): void {
    this.bossCollider?.destroy(); this.bossCollider = null;
    if (this.boss) { this.boss.destroy(); this.boss = null; }
    this.bossDoorsPending = [];
    // 开门：封门的格子恢复成原样
    this.bossDoors.forEach(c => this.terrain.set(c.x, c.y, this.terrain.original[c.y][c.x]));
    this.bossDoors = [];
    if (defeated && this.bossRoom) { const key = roomKeyAt(this.model, this.bossRoom.rx, this.bossRoom.ry); if (key) this.bossDefeated.add(key); }
    this.bossRoom = null;
    store.dispatch(setBoss(null));
    this.music.play('bgm');
    this.fogDirty = true;
  }

  private hurtBoss(amount: number): void {
    if (!this.boss || this.boss.invulnerable(this.time.now)) return;
    const dead = this.boss.hurt(amount, this.time.now);
    store.dispatch(setBoss({ hp: this.boss.hp, max: this.boss.maxHp }));
    this.cameras.main.shake(120, 0.008);
    if (dead) {
      playCrush(this.sparks, this.boss.x, this.boss.y);
      for (let i = 0; i < 6; i++) this.sparks.explode(10, this.boss.x + (Math.random() - 0.5) * 80, this.boss.y + (Math.random() - 0.5) * 60);
      // 爆开：一圈穿墙火花，唯一作用是点燃碰到的引线端点
      this.burst(this.boss.x, this.boss.y);
      this.flash('大史莱姆倒下了', '#ffd166');
      if (this.bossSealEntry && this.bossRoom) { this.bossWon = { entry: this.bossSealEntry, at: { x: this.boss.x, y: this.boss.y } }; this.bossKey = roomKeyAt(this.model, this.bossRoom.rx, this.bossRoom.ry); }
      this.endBoss(true);
    }
  }

  private updateBursts(dt: number): void {
    if (!this.bursts.length) return;
    let lit = 0;
    this.bursts.forEach(b => b.update(dt, cell => {
      if (!this.fuses.isEnd(cell.x, cell.y)) return false;
      if (this.fuses.ignite([cell], this.terrain, cells => this.onFuseBurn(cells))) lit++;
      return true;
    }));
    if (lit) this.flash('引线点燃！', '#ff7b54');
    this.bursts = this.bursts.filter(b => b.alive);
  }

  private updateBoss(): void {
    this.sealBossDoors();
    if (!this.boss) return;
    const boss = this.boss, T = this.cfg.tile;
    const ev = boss.step(this.time.now, { x: this.player.x, y: this.player.y });
    const feet = { x: Math.floor(boss.x / T), y: Math.floor(boss.body.bottom / T) };
    if (ev.heavyLanded) { this.cameras.main.shake(260, 0.012); this.terrain.shake([feet], 2.5); }
    else if (ev.landed) { this.cameras.main.shake(120, 0.005); this.terrain.shake([feet], 1.5); }
    if (ev.spit) this.spitMinions(boss);
    // 快速下落的碎块砸中 → 扣血，碎块被吞掉
    const rect = boss.rect();
    if (boss.invulnerable(this.time.now)) return this.checkBossTouch(boss, rect);
    this.terrain.chunks.slice().forEach(ch => {
      if (ch.vy < this.cfg.crushMinSpeed || boss.hitBy.has(ch.id)) return;
      let hits = 0;
      this.terrain.forEachChunkCell((c, cx, cy, w, h) => { if (c === ch && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), rect)) hits++; });
      if (!hits) return;
      boss.hitBy.add(ch.id);
      this.fallingPlatforms.get(ch.id)?.destroy(); this.fallingPlatforms.delete(ch.id);
      this.terrain.removeChunk(ch);
      this.sparks.explode(12, boss.x, boss.body.top);
      this.hurtBoss(Math.min(4, hits));
    });
    if (!this.boss) return;
    this.checkBossTouch(boss, rect);
  }

  /** 碰到 Boss 即死：用收过边的致命矩形对玩家收 3 像素的矩形，贴上去才算 */
  private checkBossTouch(boss: Boss, _rect: Phaser.Geom.Rectangle): void {
    if (this.dead || this.won) return;
    const pb = this.player.body;
    const pr = new Phaser.Geom.Rectangle(pb.x + 3, pb.y + 3, pb.width - 6, pb.height - 6);
    if (Phaser.Geom.Intersects.RectangleToRectangle(boss.lethalRect(), pr)) this.die('被大史莱姆吞了');
  }

  private spitMinions(boss: Boss): void {
    const alive = (this.enemies.getChildren() as Enemy[]).filter(e => e.active).length;
    const room = this.bossRoom ?? this.room;
    for (let i = 0; i < 2 && alive + i < this.cfg.bossMaxMinions; i++) {
      const e = new Enemy(this, { x: boss.x, y: boss.body.top, rx: room.rx, ry: room.ry });
      e.setVelocity((i === 0 ? -1 : 1) * (120 + Math.random() * 80), -260);
      this.enemies.add(e);
    }
    this.sparks.explode(8, boss.x, boss.body.top);
  }

  /** 进入新房间：记录入口状态（位置 + 速度），重置时回到这里；顺便存档 */
  private onRoomChanged(r: RoomCoord): void {
    const p = this.player, T = this.cfg.tile;
    // 重置点离房间边缘至少 1.5 格：人整个在房间里，边缘那一列被封成岩石也压不到
    const nx = Phaser.Math.Clamp(p.x, r.rx * this.roomPxW + T * 1.5, (r.rx + 1) * this.roomPxW - T * 1.5);
    const ny = Phaser.Math.Clamp(p.y, r.ry * this.roomPxH + T * 1.5, (r.ry + 1) * this.roomPxH - T * 1.5);
    this.prevEntry = this.entry;
    this.entry = { x: nx, y: ny, vx: p.body.velocity.x, vy: p.body.velocity.y };
    this.enterRoom(r, false);
    if (!this.playtest) this.autosave();
    if (this.roomFlagBoss(r)) this.startBoss(r);
  }

  private autosave(): void {
    store.dispatch(writeSave({ floorId: this.floorId, items: [...this.heldIds], rows: this.terrain.rows(), room: this.room, entry: this.entry, stats: { jumps: this.jumps, destroyed: this.destroyed }, fog: this.fog?.toState(), fuse: this.fuses.toState() }));
  }

  private resetRoom(): void {
    this.clearCarried();
    if (this.boss || this.bossDoors.length || this.bossDoorsPending.length) this.endBoss(false);
    this.terrain.resetRect(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
    this.fuses.resetRect(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
    // 在 Boss 房里重置：Boss 回来，重新打
    if (this.inBossRoom(this.room)) this.forgetBossWin();
    (this.enemies.getChildren() as Enemy[]).forEach(e => { if (e.active && this.sameRoom(e.spawn, this.room)) e.destroy(); });
    this.enemySpawns.filter(sp => this.sameRoom(sp, this.room)).forEach(sp => this.spawnEnemy(sp));
    this.player.respawn(this.entry);
    this.dead = false;
    this.fogDirty = true;
    this.lastResetAt = this.time.now;
    this.flash('房间已重置', '#9ad1ff');
    if (this.roomFlagBoss(this.room)) this.startBoss(this.room);
  }

  /** 死亡重置整张地图：所有房间的地形、引线、怪物恢复，玩家回到当前房间的重置点；探索记忆保留 */
  private resetWorld(): void {
    this.clearCarried();
    if (this.boss || this.bossDoors.length || this.bossDoorsPending.length) this.endBoss(false);
    // 第一层、且不是死在 Boss 房：回到 Boss 房，Boss 在你眼前再炸一次（引线重新点燃、路重新打开）。
    // 其他情况（死在 Boss 房里、或不在第一层）：Boss 回来，重新打
    const replay = !!this.bossWon && floorIndex(this.project, this.floorId) === 0 && !this.inBossRoom(this.room);
    if (!replay) this.forgetBossWin();
    const won = replay ? this.bossWon : null;
    this.bossDefeated.clear();
    if (won) this.bossDefeated.add(this.bossKey!);
    this.terrain.resetRect(0, 0, this.terrain.w, this.terrain.h);
    this.fuses.resetRect(0, 0, this.terrain.w, this.terrain.h);
    (this.enemies.getChildren() as Enemy[]).slice().forEach(e => e.destroy());
    this.enemySpawns.forEach(sp => this.spawnEnemy(sp));
    if (won) {
      // 直接回到 Boss 房，Boss 再炸一次
      this.entry = won.entry; this.prevEntry = null;
      const r = this.roomOf(won.entry.x, won.entry.y);
      if (!this.sameRoom(r, this.room)) this.enterRoom(r, true);
      this.replayBossDeath(won.at);
    }
    this.player.respawn(this.entry);
    this.dead = false;
    this.fogDirty = true;
    this.lastResetAt = this.time.now;
    this.flash('地图已重置', '#9ad1ff');
    if (this.roomFlagBoss(this.room)) this.startBoss(this.room);
  }

  private exitPlaytest(): void {
    bridge.emit(EVT.playtestExit);
    this.scene.start(SCENE.editor);
  }

  // ---------- 怪物 ----------
  private spawnEnemy(sp: EnemySpawn): void { this.enemies.add(new Enemy(this, sp)); }

  /** 飘落的碎块贴到怪物头顶时，改由怪物驮着 */
  private catchChunk(ch: Chunk): boolean {
    const T = this.cfg.tile;
    const xs = ch.cells.map(c => c.x), ys = ch.cells.map(c => c.y);
    const left = Math.min(...xs) * T + ch.container.x, right = (Math.max(...xs) + 1) * T + ch.container.x;
    const bottom = (Math.max(...ys) + 1) * T + ch.py;
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active) continue;
      const b = e.body;
      if (bottom < b.top - 2 || bottom > b.top + 10) continue;
      if (right <= b.left || left >= b.right) continue;
      // 飘落时的平台直接交给"被驮着"的纸，碰撞体不中断
      const platform = this.fallingPlatforms.get(ch.id);
      this.fallingPlatforms.delete(ch.id);
      const riding = !!platform && this.player.body.touching.down && platform.ridden;
      const paper = new CarriedPaper(this, this.carriedGroup, e, ch, T, platform);
      this.carried.push(paper);
      // 人正站在上面：纸贴到怪物头顶会往上挪几像素，把人一起放稳
      if (riding) { this.player.y = paper.platform.body.top - this.player.body.height / 2 - 1; this.player.setVelocityY(0); }
      this.flash('纸落在怪物背上了', '#f4f1e8');
      return true;
    }
    return false;
  }

  private updateCarried(dt: number): void {
    const T = this.cfg.tile;
    this.player.rideVx = 0;
    for (let i = this.carried.length - 1; i >= 0; i--) {
      const c = this.carried[i];
      if (!c.enemy.active) { c.drop(this.terrain, T); this.carried.splice(i, 1); continue; }
      c.update(dt);
      // 站在纸上的人跟着怪物走：给速度而不是直接挪位置，这样撞墙照样会被挡住
      if (this.player.body.touching.down && c.platform.ridden) this.player.rideVx = c.enemy.body.velocity.x;
    }
    // 飘落中的纸：平台跟着碎块走，站在上面就一起飘
    this.terrain.chunks.forEach(ch => {
      const p = this.fallingPlatforms.get(ch.id);
      if (!p) return;
      const b = this.terrain.chunkBounds(ch);
      p.place(b.x, b.y, b.w, b.h, dt);
      if (this.player.body.touching.down && p.ridden) this.player.rideVx = p.vx;
    });
  }

  private onChunkFall(ch: Chunk): void {
    this.flash('地形断裂！', '#ffd166');
    // 材质说了"下落时能站"就给它一块物理平台
    if (Tiles.get(ch.cells[0].id)?.rideable) {
      const b = this.terrain.chunkBounds(ch);
      const p = new TopPlatform(this, this.carriedGroup, b.w, b.h);
      p.place(b.x, b.y, b.w, b.h, 0);
      this.fallingPlatforms.set(ch.id, p);
    }
  }

  /** 重置前把所有"正在发生"的东西清掉：火花、飘纸、掉落平台、还没出场的 Boss、镜头抖动 */
  private clearCarried(): void {
    this.endDialogue();
    this.time.removeAllEvents();
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.shakeEffect.reset();
    this.sparks.killAll();
    this.bursts.forEach(b => b.destroy()); this.bursts = [];
    this.carried.forEach(c => c.destroy()); this.carried = [];
    this.fallingPlatforms.forEach(p => p.destroy()); this.fallingPlatforms.clear();
  }

  private killEnemy(e: Enemy): void {
    if (!e.active) return;
    playCrush(this.sparks, e.x, e.y);
    this.flash('怪物被压扁了', '#9b5de5');
    e.destroy();
  }

  private updateEnemies(): void {
    const playerRect = this.player.rect();
    (this.enemies.getChildren() as Enemy[]).forEach(e => {
      if (!e.active) return;
      e.step(this.terrain, this.roomPxW, this.cfg.enemySpeed);
      const r = e.rect();
      let crushed = false;
      this.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
        if (ch.vy >= this.cfg.crushMinSpeed && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), r)) crushed = true;
      });
      if (crushed) this.killEnemy(e);
      else if (!this.dead && !this.won && Phaser.Geom.Intersects.RectangleToRectangle(r, playerRect)) this.die('被怪物抓住了');
    });
  }

  // ---------- 背景 / 建筑 ----------
  private buildBackground(levelW: number, levelH: number): void {
    if (!this.textures.exists('sky')) {
      const c = this.textures.createCanvas('sky', 4, 256)!;
      const ctx = c.context;
      const grd = ctx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#5b7fb5'); grd.addColorStop(0.4, '#23305a'); grd.addColorStop(1, '#0b0b14');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, 256); c.refresh();
    }
    this.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(levelW, levelH).setDepth(-10);
    for (let i = 0; i < 160; i++) {
      this.add.circle(Phaser.Math.Between(0, levelW), Phaser.Math.Between(0, levelH * 0.8),
        Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).setDepth(-9);
    }
  }

  private drawBuilding(cx: number, baseY: number): void {
    const T = this.cfg.tile;
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x151a2e, 1);
    g.fillRect(cx - 4 * T, baseY - 9 * T, 8 * T, 9 * T);
    g.fillRect(cx - 1.5 * T, baseY - 13 * T, 3 * T, 4 * T);
    g.fillTriangle(cx - 1.5 * T, baseY - 13 * T, cx + 1.5 * T, baseY - 13 * T, cx, baseY - 15.5 * T);
    g.fillStyle(0xffd166, 0.85);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.fillRect(cx - 3 * T + k * 2.5 * T + 8, baseY - 8 * T + r * 2 * T + 6, 20, 28);
    g.fillRect(cx - 10, baseY - 12 * T + 8, 20, 28);
    g.fillStyle(0xffd166, 0.08); g.fillCircle(cx, baseY - 8 * T, 7 * T);
  }

  private flash(text: string, color: string): void { store.dispatch(flash({ text, color })); }

  // ---------- 技能（起跳时发生什么）/ 预览 ----------
  private skillContext(jump: JumpEvent): SkillContext {
    return {
      cfg: this.cfg,
      jump,
      previewRadius: (c, r) => this.terrain.previewExplosion(c.x, c.y, r),
      previewCells: cells => this.terrain.previewCells(cells),
      previewLoose: (c, r) => this.terrain.previewLoose([c], r),
      shake: (c, r) => { if (this.terrain.shake([c], r)) this.fogDirty = true; },
      destroy: cells => {
        const removed = this.terrain.destroyCells(cells);
        this.destroyed += removed.length;
        this.fogDirty = true;
        return removed;
      },
      fx: (center, removed, radius) => playExplosion(this, this.sparks, this.cfg.tile, center, removed, radius),
    };
  }

  /** 定向爆炸：地面起跳时按着方向，爆炸中心往那边挪 */
  private aimJump(jump: JumpEvent): JumpEvent {
    if (!this.cfg.directionalBlast || jump.kind !== 'ground' || !jump.dir) return jump;
    return { ...jump, cell: { x: jump.cell.x + jump.dir * this.cfg.directionalOffset, y: jump.cell.y } };
  }

  private useSkill(rawJump: JumpEvent): void {
    const jump = this.aimJump(rawJump);
    this.skill.onJump(this.skillContext(jump));
    this.sound.play('boom', { volume: 0.8 });
    // 爆炸中心附近有引线端点就点燃
    const ends = this.fuses.endsNear(jump.cell, this.cfg.fuseIgniteRadius);
    if (ends.length) {
      const n = this.fuses.ignite(ends, this.terrain, cells => this.onFuseBurn(cells));
      if (n) this.flash('引线点燃！', '#ff7b54');
    }
  }

  private drawPreview(jump: JumpEvent | null): void {
    const T = this.cfg.tile, g = this.preview;
    g.clear();
    if (!jump) return;
    const pv = this.skill.preview(this.skillContext(jump), jump);
    const outline = this.fog ? this.fog.filterKnown(pv.outline) : pv.outline;
    const removed = this.fog ? this.fog.filterKnown(pv.removed) : pv.removed;
    const loosened = this.fog ? this.fog.filterKnown(pv.loosened ?? []) : pv.loosened ?? [];
    g.lineStyle(1, 0xffffff, 0.25);
    outline.forEach(c => g.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2));
    removed.forEach(c => {
      const def = this.terrain.def(c.x, c.y);
      g.fillStyle(0xffffff, 0.35); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(def.color, 0.6); g.fillRect(c.x * T + 4, c.y * T + 4, T - 8, T - 8);
    });
    // 会松脱掉落的：画个向下的箭头
    loosened.forEach(c => {
      const def = this.terrain.def(c.x, c.y);
      g.fillStyle(def.color, 0.3); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(0xffffff, 0.85);
      g.fillTriangle(c.x * T + T / 2 - 6, c.y * T + T / 2 - 4, c.x * T + T / 2 + 6, c.y * T + T / 2 - 4, c.x * T + T / 2, c.y * T + T / 2 + 6);
    });
  }

  /** 玩家与下落碎块：快的压死；慢的（刚断裂）把玩家顶开，当作天花板 */
  private handleChunkContact(): void {
    const b = this.player.body;
    const rect = this.player.rect();
    let crushed = false;
    this.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
      if (crushed) return;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), rect)) return;
      if (ch.vy >= this.cfg.crushMinSpeed) { crushed = true; return; }
      const overlapY = cy + h - b.y;
      if (overlapY > 0 && overlapY < h) { this.player.y += overlapY; if (b.velocity.y < 0) this.player.setVelocityY(0); }
    });
    if (crushed) this.die('被落石压住了');
  }

  /** 引线每烧一跳：火花 + 计入摧毁数 + 迷雾要重算 */
  /** Boss 爆开：一圈穿墙火花，唯一作用是点燃碰到的引线端点 */
  private burst(x: number, y: number): void {
    this.bursts.push(new SparkBurst(this, x, y, this.cfg.bossBurstCount, this.cfg.bossBurstSpeed, this.cfg.tile, this.cfg.bossBurstTtl));
    this.cameras.main.shake(400, 0.015);
  }

  /** 打赢之后死了：回到 Boss 房，Boss 出现即炸开，重演开路那一下 */
  private replayBossDeath(at: Point): void {
    const ghost = this.add.image(at.x, at.y, 'boss').setDepth(5).setAlpha(0.85).setScale(0.6);
    this.tweens.add({ targets: ghost, scale: 1.15, alpha: 1, duration: 320, ease: 'Back.out', onComplete: () => {
      ghost.destroy();
      playCrush(this.sparks, at.x, at.y);
      for (let i = 0; i < 6; i++) this.sparks.explode(10, at.x + (Math.random() - 0.5) * 80, at.y + (Math.random() - 0.5) * 60);
      this.burst(at.x, at.y);
    } });
  }

  private onFuseBurn(cells: CellRef[]): void {
    this.fogDirty = true;
    const T = this.cfg.tile;
    if (this.boss && this.terrain.cellsOverlapRect(cells, this.boss.body)) this.hurtBoss(2);
    cells.forEach(c => this.sparks.explode(5, c.x * T + T / 2, c.y * T + T / 2));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
  }

  private onChunkLand(ch: Chunk): void {
    const cells = ch.cells;
    this.fallingPlatforms.get(ch.id)?.destroy(); this.fallingPlatforms.delete(ch.id);   // 落地后由砖块本身负责碰撞
    this.fogDirty = true;
    playLand(this);
    // 飘落的东西（纸）不会砸死任何东西，落地时也不算"埋住"
    if (cells.some(c => (Tiles.get(c.id)?.floatSpeed ?? 0) > 0)) return;
    if (!this.dead && !this.won && this.terrain.cellsOverlapRect(cells, this.player.body)) this.die('被落石埋住了');
    (this.enemies.getChildren() as Enemy[]).forEach(e => { if (e.active && this.terrain.cellsOverlapRect(cells, e.body)) this.killEnemy(e); });
  }

  /** 碰到危险格才死：用玩家碰撞框（往里收 3 像素）和危险格的致命区域做矩形相交，不再按格子粗判 */
  private touchingHazard(): string | null {
    const b = this.player.body, T = this.cfg.tile, inset = 3;
    const px = b.x + inset, py = b.y + inset, pw = b.width - inset * 2, ph = b.height - inset * 2;
    const x0 = Math.floor(px / T), x1 = Math.floor((px + pw) / T), y0 = Math.floor(py / T), y1 = Math.floor((py + ph) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const def = this.terrain.def(tx, ty);
      if (!def.hazard) continue;
      const hb = def.hazardBox ?? { x: 0, y: 0, w: T, h: T };
      const hx = tx * T + hb.x, hy = ty * T + hb.y;
      if (px < hx + hb.w && px + pw > hx && py < hy + hb.h && py + ph > hy) return def.hazard;
    }
    return null;
  }


  update(time: number, delta: number): void {
    this.terrain.updateChunks(delta / 1000);
    this.updateEnemies();
    this.updateCarried(delta / 1000);
    this.updateBoss();
    this.updateBursts(delta / 1000);
    this.updateFog();
    if (this.dead || this.won || this.leaving) { this.drawPreview(null); this.placeHeld(); return; }

    const p = this.player;
    const r = this.roomOf(p.x, p.y);
    if (!this.sameRoom(r, this.room)) { this.onRoomChanged(r); this.updateFog(); }   // 同一帧把新房间的迷雾画好，不给它露脸的机会

    this.checkNpcs();
    const lock = !!this.talking;   // 对话中站着别动，只能跳
    const input = { left: !lock && (this.cursors.left.isDown || this.keys.A.isDown || touch.left), right: !lock && (this.cursors.right.isDown || this.keys.D.isDown || touch.right) };
    const jump = p.step(input, time);
    if (jump) { this.jumps += 1; this.useSkill(jump); store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed })); if (lock) this.advanceDialogue(); }

    this.drawPreview(p.previewJump(input) && this.aimJump(p.previewJump(input)!));
    this.checkItems();
    this.placeHeld();
    this.updateSliders();
    this.handleChunkContact();
    if (this.dead) return;
    const hazard = this.touchingHazard();
    if (hazard) { this.die(hazard); return; }
    if (this.goal && Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 24) this.win(false);
    this.checkFloorExits();
  }

  // ---------- 层 ----------
  /** 塔门：走进去到下一层；文字方块：整串字都炸掉了就跳到它指定的层 */
  private checkFloorExits(): void {
    const p = this.player;
    const portal = this.portals.find(pt => Phaser.Math.Distance.Between(p.x, p.y, pt.x, pt.y) < 24);
    if (portal) {
      const next = floorAfter(this.project, this.floorId);
      if (next) this.goToFloor(next.id, portal); else this.win(true);
      return;
    }
    for (const tb of this.textBlocks) {
      if (tb.done) continue;
      if (!tb.cells.every(c => this.terrain.grid[c.y]?.[c.x] !== tb.block.tile)) continue;
      tb.done = true;
      this.goToFloor(tb.block.target);
      return;
    }
  }

  /** 换层。给了 via（门的位置）就先来一段旋涡：画面转着拉近门，人和东西都被吸进去 */
  private goToFloor(id: string, via?: Point): void {
    if (this.leaving) return;
    const floor = this.project.floors.find(f => f.id === id);
    if (!floor) { this.flash('没有这一层', '#ef476f'); return; }
    this.leaving = true;
    this.endDialogue();
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const cam = this.cameras.main;
    const restart = () => {
      const data: StartGameData = { project: this.project, floorId: id, playtest: this.playtest, announceFloor: true, stats: { jumps: this.jumps, destroyed: this.destroyed }, items: [...this.heldIds] };
      this.scene.restart(data);
    };
    const fade = (ms: number) => { cam.fadeOut(ms, 0, 0, 0); cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, restart); };
    if (!via) { fade(350); return; }
    this.vortex(via, () => fade(250));
  }

  /** 旋涡：镜头一边转一边拉近门口；房间里的人、怪、碎块、骷髅和一把碎屑沿螺旋线缩进门里 */
  private vortex(p: Point, then: () => void): void {
    const DUR = 1500, cam = this.cameras.main, T = this.cfg.tile;
    cam.pan(p.x, p.y - T / 2, DUR, 'Sine.easeIn');
    cam.zoomTo(3, DUR, 'Sine.easeIn');
    cam.rotateTo(Math.PI * 1.25, false, DUR, 'Sine.easeIn');
    type Suckable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle;
    const suck = (obj: Suckable, delay: number, dur: number) => {
      const dx = obj.x - p.x, dy = obj.y - p.y;
      const r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx), s0 = obj.scale;
      const k = { t: 0 };
      this.tweens.add({ targets: k, t: 1, delay, duration: dur, ease: 'Quad.easeIn', onUpdate: () => {
        const r = r0 * (1 - k.t), a = a0 + k.t * Math.PI * 3;
        obj.setPosition(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        obj.setScale(s0 * (1 - k.t * 0.9)); obj.setAngle(k.t * 720); obj.setAlpha(1 - k.t * 0.6);
      } });
    };
    const room = this.roomOf(p.x, p.y);
    const inRoom = (x: number, y: number) => this.sameRoom(this.roomOf(x, y), room);
    // 人、怪、骷髅、Boss
    suck(this.player, 150, DUR - 200);
    (this.enemies.getChildren() as Enemy[]).forEach(e => { if (e.active && inRoom(e.x, e.y)) { e.body.enable = false; suck(e, Math.random() * 300, DUR - 400); } });
    this.npcs.forEach(n => { if (n.sprite.active && inRoom(n.sprite.x, n.sprite.y)) suck(n.sprite, Math.random() * 300, DUR - 400); });
    if (this.boss) suck(this.boss, 200, DUR - 400);
    // 碎块只能淡出（容器缩放会绕原点转）
    this.terrain.chunks.forEach(ch => this.tweens.add({ targets: ch.container, alpha: 0, duration: DUR * 0.6 }));
    // 一把碎屑：从房间各处沿螺旋飞进门
    const x0 = room.rx * this.roomPxW, y0 = room.ry * this.roomPxH;
    const colors = [0x8d5a3b, 0x5d6470, 0xc9b27c, 0xffd166, 0x4cc9f0, 0xf1efe6];
    for (let i = 0; i < 60; i++) {
      const bit = this.add.rectangle(x0 + Math.random() * this.roomPxW, y0 + Math.random() * this.roomPxH, 3 + Math.random() * 6, 3 + Math.random() * 6, colors[i % colors.length]).setDepth(9);
      suck(bit, Math.random() * 500, 700 + Math.random() * 600);
    }
    this.cameras.main.shake(DUR, 0.003);
    this.time.delayedCall(DUR, then);
  }

  private updateFog(): void {
    if (!this.fog) return;
    const T = this.cfg.tile, b = this.player.body;
    const tx = Math.floor(b.center.x / T), ty = Math.floor(b.center.y / T);
    if (tx !== this.fogTile.x || ty !== this.fogTile.y || this.fogDirty) {
      this.fogTile = { x: tx, y: ty }; this.fogDirty = false;
      this.fog.compute(tx, ty);
    }
    this.fog.draw();
  }

  private die(reason: string): void {
    if (this.dead || this.leaving) return;
    this.dead = true;
    this.endDialogue();
    // 刚重置就死 = 入口本身致命 → 退回上一个房间的入口
    if (this.lastResetAt != null && this.time.now - this.lastResetAt < 400 && this.prevEntry) {
      this.entry = this.prevEntry; this.prevEntry = null;
      const r = this.roomOf(this.entry.x, this.entry.y);
      if (!this.sameRoom(r, this.room)) this.enterRoom(r, false);
    }
    this.player.freeze(0xef476f);
    this.flash(reason, '#ef476f');
    this.cameras.main.shake(200, 0.01);
    this.diedAt = this.time.now;
    store.dispatch(setMode({ mode: 'dead' }));
  }

  private diedAt = 0;

  /** 死亡画面里按 R（或点一下）：按设置重置整张地图或当前房间 */
  private resetAfterDeath(): void {
    if (!this.dead || this.time.now - this.diedAt < 300) return;   // 刚死的一瞬间不响应，免得误触
    if (this.cfg.deathResetsWorld) this.resetWorld(); else this.resetRoom();
    store.dispatch(setMode({ mode: 'playing' }));
  }

  /** 通关画面。final=false 是"假通关"（到达终点建筑）：跳一下 / 点一下就继续玩，终点不再触发；final=true 是最后一层的真结束 */
  private wonFinal = false;
  private win(final: boolean): void {
    if (this.won) return;
    this.won = true; this.wonFinal = final;
    this.player.freeze(0xffffff);
    this.player.clearTint();
    store.dispatch(setMode({ mode: 'won', final }));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
  }
  private continueAfterWin(): void {
    if (!this.won || this.wonFinal) return;
    this.won = false; this.goal = null;
    this.player.unfreeze();
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
  }
}
