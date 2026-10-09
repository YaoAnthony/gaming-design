import { captureCheckpoint, checkpointMatches } from '@/game/core/checkpoint';
import { backgroundDef } from '@/asset/backgrounds';
// ===== 游戏场景：只做编排 =====
// 核心部件各管一摊（game/core/）：地形、碎块、怪物、引线、迷雾、房间与镜头（Rooms）、死亡与重置（Respawn）、
// 长大仪式（Growth）、攥纸团（CrumpleFx）、按键（GameInput）。玩法都在 game/mechanics/ 里：一个层机制（这一层怎么动）
// + 若干通用机制（Boss、钥匙、角色……），这里按生命周期调用它们的钩子，不认识具体机制。
import Phaser from 'phaser';
import type { WorldCheckpoint, EntryState, CarryOver, CoreHost, EnemySpawn, Floor, GameConfig, Point, Project, WorldModel } from '@/type';
import { jsonCarry } from '@/shared/carry';
import { classify } from '@/game/registry/registry';
import { Terrain, type RemovedCell } from '@/game/terrain/Terrain';
import { entityRows, floorAfter, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { layerRows } from '@/game/world/layers';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, type StartGameData } from '@/protocol';
import { SCENE } from '@/game/scenes/keys';
import { Player } from '@/sprite';
import { createSparkEmitter, TileFx, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { Music } from '@/game/Music';
import { DEFAULT_MUSIC } from '@/asset';
import { flash, setPaused, setBoss, setBossIntro, setControls, setEditorShell, setHearts, setDialogue, setMode, setPlace, setRhythm, setRhythmMode, setScore, setStats, whiteout } from '@/redux/slices/hudSlice';
import { setConfig } from '@/redux/slices/configSlice';
import { checkpoint, clearRun, setFlag, solveRoom } from '@/redux/slices/runSlice';
import { resumeData } from '@/game/world/resume';
import { ENDINGS, endingChoices, type EndingChoice } from '@/story/config';
import { STORY, type StoryFlag } from '@/story/flags';
import { mapText, tr } from '@/i18n';
import { floorMechanicOf, globalMechanicsOf, type FloorMechanic, type FuseBurnCell, type Mechanic, type MechanicDef } from '@/game/mechanics/define';
import type { PlayContext } from '@/game/core/PlayContext';
import { Dialogue } from '@/game/core/Dialogue';
import { Enemies } from '@/game/core/Enemies';
import { Debris } from '@/game/core/Debris';
import { shiftUnder } from '@/game/core/solid';
import { Solids } from '@/game/core/solids';
import { LooseItems } from '@/game/core/LooseItems';
import { Rooms } from '@/game/core/Rooms';
import { Respawn } from '@/game/core/Respawn';
import { Solves } from '@/game/core/Solves';
import { Growth } from '@/game/core/Growth';
import { Health } from '@/game/core/Health';
import { PopOut } from '@/game/core/PopOut';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import type { DeathKey } from '@/i18n/keys';
import { CrumpleFx } from '@/game/core/CrumpleFx';
import { GameInput } from '@/game/core/GameInput';
import { standingSpot, touchingHazard } from '@/game/core/roomSpots';
import { Backdrop, queueBackgrounds } from '@/game/background/Backdrop';
import { backgroundOf, startRoomKey } from '@/game/background/layout';
import { applySceneFx, type SceneFx } from '@/game/core/sceneFx';
import { vortex } from '@/game/core/vortex';
import { Colors, hex } from '@/shared/palette';


/** 关掉暂停菜单之后这么久（毫秒）里不再响应暂停 */
const RESUME_GUARD_MS = 250;

export class GameScene extends Phaser.Scene {
  private startData!: StartGameData;
  private cfg!: GameConfig;
  private project!: Project;
  private floor!: Floor;
  /** 当前层的模型（已经过各机制的 bake） */
  private model!: WorldModel;

  /** 这一层的机制：第一个是层机制，后面是启用的通用机制（按注册顺序） */
  private mechs: Mechanic[] = [];
  private floorMech!: FloorMechanic;
  private mechById = new Map<string, Mechanic>();
  private ctx!: PlayContext;

  private terrain!: Terrain;
  private fuses!: FuseNet;
  private fog: FogOfWar | null = null;
  private fogTile = { x: -1, y: -1 };
  /** 上次算迷雾时人是不是正被骷髅手拎着：拎着路过迷雾区不揭开，落地那一帧要重算一次 */
  private fogCarried = false;
  private fogDirty = true;
  /** 画面效果（暗角、微尘） */
  private sceneFx!: SceneFx;
  private player!: Player;
  private enemies!: Enemies;
  private debris!: Debris;
  private solids!: Solids;
  /** 地上的东西（钥匙、蜡烛、帽子、胶带）的物理 */
  private loose!: LooseItems;
  private syncLoose = (): void => this.loose.sync(this.time.now);
  private sparks!: SparkEmitter;
  /** 砖块炸碎 / 烧裂 / 落地的特效 */
  private tileFx!: TileFx;
  private music!: Music;
  private dialogue!: Dialogue;
  private rooms!: Rooms;
  private respawn!: Respawn;
  private solves!: Solves;
  private worldCheckpoint: WorldCheckpoint | null = null;
  private checkpointPending: { entry: EntryState | null; kind: WorldCheckpoint['kind'] } | null = null;
  private health!: Health;
  private growth!: Growth;
  private crumple!: CrumpleFx;
  private popOut!: PopOut;
  private backdrop!: Backdrop;
  private controls!: GameInput;

  private spawnPoints: Point[] = [];
  private won = false;
  /** 通关画面是不是真的结束（否则按一下继续玩） */
  private wonFinal = false;
  /** 正在切层（淡出中），不再响应输入 */
  private leaving = false;
  /** 有机制让主角晚点出场（标题画面）：人藏着、冻着，等 ctx.enter() */
  private awaitingEntrance = false;
  /** 试玩时的剧情标记（只记在这一场里）；正式玩记在存档 run.flags */
  private localFlags = new Set<StoryFlag>();
  private flagWatchers: ((f: StoryFlag) => void)[] = [];
  private stats = { jumps: 0, destroyed: 0 };
  /** 上次关掉暂停菜单的时刻：关菜单的那一下 ESC 可能还排在 Phaser 的按键队列里，别让它马上又把菜单打开 */
  private resumedAt = 0;

  constructor() { super(SCENE.game); }

  init(data: StartGameData): void {
    this.startData = data;
    this.project = data.project;
    this.floor = (data.floorId && this.project.floors.find(f => f.id === data.floorId)) || this.project.floors[0];
    this.mechs = []; this.mechById = new Map();
    this.worldCheckpoint = data.world ?? null; this.checkpointPending = null;
    this.fog = null; this.fogTile = { x: -1, y: -1 }; this.fogDirty = true; this.fogCarried = false;
    this.spawnPoints = [];
    this.stats = { jumps: data.stats?.jumps ?? 0, destroyed: data.stats?.destroyed ?? 0 };
    this.won = false; this.wonFinal = false; this.leaving = false; this.awaitingEntrance = false;
    this.flagWatchers = [];
    if (!data.origin) this.localFlags = new Set();   // 换层时试玩的标记跟着走；新的一场清空
  }

  /** 开场所在房间的背景图先下好（进去第一帧就是对的背景，不先露出蓝色天空再突然换图）；别的房间的图进来以后 Backdrop 在后台接着下 */
  preload(): void {
    const key = startRoomKey(this.floor.model, store.getState().config.tile, this.startData);
    if (key) queueBackgrounds(this, [backgroundOf(this.floor, this.floor.model, key)]);
  }

  create(): void {
    this.cfg = store.getState().config;
    if (this.worldCheckpoint && !checkpointMatches(this.worldCheckpoint, this.floor, this.cfg.tile, Math.max(...this.floor.model.layout.map(r => r.length)) * this.floor.model.roomW, this.floor.model.layout.length * this.floor.model.roomH)) {
      this.worldCheckpoint = null; this.startData.entry = null;
    }
    const T = this.cfg.tile;
    if (this.worldCheckpoint) {
      const world = this.worldCheckpoint;
      this.localFlags = new Set(Object.keys(world.flags) as StoryFlag[]);
      if (!this.playtest) store.dispatch(checkpoint({ stage: world.stage, carry: world.carry, stats: world.stats, flags: world.flags }));
    }

    // ---- 机制：层机制一个 + 启用的通用机制；建地形之前先让它们改模型 ----
    const defs: MechanicDef[] = [floorMechanicOf(this.floor), ...globalMechanicsOf(this.floor)];
    const baked = new Map<string, unknown>();
    let model = this.floor.model;
    defs.forEach(d => { if (!d.bake) return; const r = d.bake(model); model = r.model; baked.set(d.id, r.data); });
    this.model = model;

    // ---- 画布 = 一个房间；每层房间尺寸可以不同 ----
    const roomPxW = model.roomW * T, roomPxH = model.roomH * T;
    resizeGame(this.game, roomPxW, roomPxH);
    this.cameras.main.setSize(roomPxW, roomPxH);
    this.cameras.main.setZoom(1).setRotation(0);

    // ---- 地形：地图本身就是"原始状态"（R 重置用） ----
    this.terrain = new Terrain({
      scene: this,
      onChunkFall: ch => this.debris.onChunkFall(ch),
      onChunkLand: ch => this.debris.onChunkLand(ch),
      catchChunk: ch => this.debris.catchChunk(ch),
      onCellsBroken: cells => this.onCellsBroken(cells),
      onCellsDestroyed: cells => this.tileFx.broken(cells.map(c => ({ x: c.x, y: c.y, mat: c.def.debris }))),
      onCellsCracked: cells => this.tileFx.cracked(cells),
      occupied: (x, y) => this.mechs.some(m => m.occupies?.(x, y)),
      onChunkRemoved: ch => this.debris.onChunkRemoved(ch),
      drawnElsewhere: (x, y) => this.mechs.some(m => m.drawsCell?.(x, y)),
    }, worldRows(model), { tile: T, explosionRadius: this.cfg.explosionRadius, chunkGravity: this.cfg.chunkGravity, chunkMaxFall: this.cfg.chunkMaxFall });
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    this.backdrop = new Backdrop(this, this.floor, { w: roomPxW, h: roomPxH });   // 背景（这一层 / 每个房间各用哪个，见 asset/backgrounds.ts）
    // 画面效果（config.sceneFx）：墙的投影、体积感、暗角、微尘
    if (this.cfg.sceneFx.shadow) this.terrain.enableShadow(4, 5, 0.35);
    if (this.cfg.sceneFx.depth) this.terrain.enableShading();
    const fxRooms = model.layout.flatMap((row, ry) => row.flatMap((key, rx) => (key ? [{
      x: rx * roomPxW, y: ry * roomPxH, w: roomPxW, h: roomPxH, key, dark: !!model.roomFlags?.[key]?.fog,
      woodland: backgroundDef(backgroundOf(this.floor, model, key)).ambient === 'woodland',
    }] : [])));
    this.sceneFx = applySceneFx(this, this.cfg.sceneFx, fxRooms, T);
    this.fuses = new FuseNet(this, layerRows(model, 'fuse'), { tile: T, delayMs: this.cfg.fuseDelayMs, light: (x, y) => this.sceneFx.light(x, y, 'ember') });

    // 迷雾层：有全屋暗的房间（roomFlags.fog），或者画了迷雾区，才建；普通房间里只有迷雾区是黑的
    const darkRooms = new Set(Object.entries(model.roomFlags ?? {}).filter(([, f]) => f.fog).map(([k]) => k));
    const zones = layerRows(model, 'fog');
    if (darkRooms.size || zones.some(r => /[^.]/.test(r))) {
      this.fog = new FogOfWar(this, this.terrain.grid, zones.map(r => r.split('')), {
        tile: T, roomW: model.roomW, roomH: model.roomH, radius: this.cfg.fogRadius, memoryAlpha: this.cfg.fogMemoryAlpha, unseenAlpha: this.cfg.fogUnseenAlpha,
        keyAt: (rx, ry) => roomKeyAt(model, rx, ry), darkRooms,
      }, this.worldCheckpoint?.fog ?? undefined);
    }

    this.sparks = createSparkEmitter(this);
    this.tileFx = new TileFx(this, T);
    this.music = new Music(this, this.cfg.musicVolume, this.floor.music ?? DEFAULT_MUSIC);
    this.dialogue = new Dialogue(() => ({ y: this.player.y - this.cameras.main.scrollY, h: this.cameras.main.height }));
    this.rooms = new Rooms({ scene: this, cfg: this.cfg, model, terrain: this.terrain, fog: () => this.fog, fx: () => this.sceneFx });
    this.respawn = new Respawn({
      scene: this, cfg: this.cfg, rooms: this.rooms, terrain: this.terrain, fuses: this.fuses, dialogue: this.dialogue, sparks: this.sparks,
      player: () => this.player, enemies: () => this.enemies, debris: () => this.debris, mechs: () => this.mechs,
      busy: () => this.leaving || this.growth.growing,
      flash: (text, color) => this.flash(text, color),
      fogDirty: () => { this.fogDirty = true; },
      setMode: mode => store.dispatch(setMode({ mode, playtest: this.playtest })),
      onRespawn: () => this.health?.reset(),
      away: () => this.popOut.away,
      beforeReset: () => this.solves.flush(),
      restoreCheckpoint: () => this.restoreWorldCheckpoint(),
    });
    this.growth = new Growth({
      scene: this, cfg: this.cfg, rooms: this.rooms, respawn: this.respawn, terrain: this.terrain, fuses: this.fuses,
      player: () => this.player, enemies: () => this.enemies, mechs: () => this.mechs, spawnPoint: () => this.spawnPoints[0] ?? null,
      announce: () => this.flash(mapText(this.floor.name), hex(Colors.gold)),
      fogDirty: () => { this.fogDirty = true; },
    });
    this.crumple = new CrumpleFx(this, () => this.dialogue.end());
    this.popOut = new PopOut({ scene: this, player: () => this.player, tile: T, canLeave: () => !this.busy && !this.crumple.active, blocked: (cx, cy) => this.ctx.blocked(cx, cy), hazard: (cx, cy) => !!this.terrain.def(cx, cy).hazard });
    this.solids = new Solids(this, () => ({ player: this.player, enemies: this.enemies.group }));
    this.loose = new LooseItems({ scene: this, cfg: this.cfg, terrain: this.terrain, rooms: this.rooms, solids: this.solids, enemies: () => this.enemies.group });
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncLoose);   // 物理把位置同步好之后：贴图摆到物理体上（机制的 POST_UPDATE 在它后面）
    this.ctx = this.buildContext();
    this.enemies = new Enemies(this.ctx);
    this.debris = new Debris(this.ctx);

    // ---- 机制实例 ----
    defs.forEach(d => { const m = d.create(this.ctx, baked.get(d.id)); this.mechs.push(m); this.mechById.set(d.id, m); });
    this.floorMech = this.mechs[0] as FloorMechanic;
    this.health = new Health({
      scene: this, cfg: this.cfg, player: () => this.player, enabled: defs[0].hearts,
      canHurt: () => !this.frozen,
      die: reason => this.die(reason),
      show: v => store.dispatch(setHearts(v)),
    });

    // ---- 物件：每个字符问注册表；属于机制的交给机制实例，核心物件交给场景 ----
    const core: CoreHost = { addSpawnPoint: p => this.spawnPoints.push(p), addEnemy: (sp: EnemySpawn) => this.enemies.addSpawn(sp) };
    entityRows(model).forEach((row, y) => [...row].forEach((c, x) => {
      const cls = classify(c);
      if (cls.kind !== 'entity') return;
      const target = cls.def.mechanic ? this.mechById.get(cls.def.mechanic) : core;
      if (!target) return;   // 机制没在这一层启用（比如平台层里放了豆子）
      cls.def.spawn(target, { x: x * T + T / 2, y: y * T + T / 2, cell: { x, y, rx: Math.floor(x / model.roomW), ry: Math.floor(y / model.roomH) } });
    }));

    // ---- 解开过的房间：读档时换成解开时的样子（标题画面、试玩不读） ----
    this.solves = new Solves({
      scene: this, rooms: this.rooms, terrain: this.terrain, fuses: this.fuses, mechs: () => [...this.mechById],
      save: (room, data, node) => { if (!this.playtest) store.dispatch(solveRoom({ floorId: this.floor.id, room, data, node })); },
    });
    if (this.worldCheckpoint) this.solves.restoreNodes(this.worldCheckpoint.nodes);
    else if (!this.playtest && !this.startData.opening) this.solves.restore(store.getState().run.solved[this.floor.id]);

    // ---- 玩家：读档入口 > 指定起始房间（里面的出生点，否则找个能站的地方）> 全图出生点 > 兜底 ----
    const startRoom = this.startData.startRoom ?? null;
    let start: Point | null = this.startData.entry ?? null;
    if (!start && startRoom) start = this.spawnPoints.find(p => this.rooms.same(this.rooms.of(p.x, p.y), startRoom)) ?? standingSpot(this.terrain, startRoom, model.roomW, model.roomH, this.cfg.playerHeight);
    start ??= this.spawnPoints[0] ?? { x: 2 * T, y: 4 * T };
    this.player = new Player(this, start.x, start.y, this.cfg);
    if (this.startData.stage) this.player.setStage(this.startData.stage);   // 上一层已经长大了：带过来
    if (this.startData.entry) this.player.setVelocity(this.startData.entry.vx, this.startData.entry.vy);
    this.physics.world.gravity.y = this.floorMech.gravity ?? this.cfg.gravity;
    if (this.floorMech.collideTerrain) this.physics.add.collider(this.player, this.terrain.layer, undefined, this.terrain.landsOnOneWay);
    this.solids.start();   // 玩家有了：把登记过的实心体（移动方块、纸、箱子、钥匙）的碰撞器都挂上
    this.loose.start();    // 地上的东西：怪物推它、箱子托着它

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.respawn.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.rooms.enter(this.rooms.of(start.x, start.y), true);

    // ---- HUD（机制 start 里可能会改，比如吃豆人显示分数） ----
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setPaused(false));
    store.dispatch(setPlace(mapText(this.floor.place ?? '')));
    store.dispatch(setControls(defs[0].controls)); store.dispatch(setScore(null));
    store.dispatch(setStats(this.stats));

    this.mechs.forEach(m => m.start?.());
    if (this.worldCheckpoint) this.applyWorldCheckpoint(this.worldCheckpoint);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.writeCheckpoint);
    this.mechs.forEach(m => m.onRoomChanged?.(this.rooms.current));

    this.controls = new GameInput(this, {
      press: key => { if (this.awaitingEntrance || this.respawn.respawning || this.popOut.away || this.controlled) return; if (this.won) this.continueAfterWin(); else this.floorMech.onPress(key, this.time.now); },
      // 换层（旋涡、淡出）和长大的过程中不响应 R：重置会清掉它们正在等的计时器和镜头，画面就卡在半路
      reset: () => { if (this.awaitingEntrance || this.won || this.leaving || this.growth.growing || this.respawn.respawning || this.crumple.active || this.controlled) return; if (this.respawn.dead) this.respawn.resetAfterDeath(); else this.requestRoomReset(); },
      continueGame: () => { if (this.won) this.continueAfterWin(); },
      restartRun: () => this.restartRun(),
      nextLevel: () => this.fakeNextLevel(),
      exitPlaytest: () => { if (this.playtest) this.exitPlaytest(); },
      pause: () => this.pause(),
      resume: () => this.resume(),
      endingChoice: c => this.onEndingChoice(c),
      crumpleFreeze: () => this.crumple.freeze(),
      crumpleDone: d => this.crumple.end(d),
      popOut: () => this.popOut.request(),
      heroEntry: q => this.popOut.answerEntry(q),
      heroReturn: at => this.popOut.comeBack(at),
    }, this.playtest);
    // 玩家出场：换层带着 origin（这一局早就开始了），没有就是这一局的第一次出现。有机制要人晚点出场（标题画面）就先藏着
    if (this.mechs.some(m => m.delaysEntrance?.())) {
      this.awaitingEntrance = true;
      this.player.freeze(0xffffff); this.player.clearTint(); this.player.setVisible(false);
      store.dispatch(setMode({ mode: 'opening', playtest: this.playtest }));
    } else { this.enterPlayer(); this.saveCheckpoint(); }   // 标题画面不存：选了开始 / 继续才算

    if (!this.awaitingEntrance) this.music.playBase();   // 标题画面的音乐由让人晚出场的那个机制放
    let lastVol = this.cfg.musicVolume;
    const unsubVol = store.subscribe(() => { const v = store.getState().config.musicVolume; if (v !== lastVol) { lastVol = v; this.music.setVolume(v); } });
    if (this.startData.announceFloor) {
      this.cameras.main.fadeIn(350, 0, 0, 0);
      this.flash(mapText(this.floor.name), hex(Colors.gold));
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mechs.forEach(m => m.destroy?.());
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLoose);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.writeCheckpoint);
      // 迷雾和地形体积感的画布是全局贴图（场景关了还在）：换层 / 重开时不放掉，内存只增不减
      this.fog?.destroy(); this.fog = null;
      this.terrain.destroy();
      unsubVol();
      if (store.getState().hud.paused) store.dispatch(setPaused(false));
      this.music.stop();
      store.dispatch(setMode({ mode: 'idle' })); store.dispatch(setBoss(null)); store.dispatch(setBossIntro(null)); store.dispatch(setHearts(null)); store.dispatch(setDialogue(null));
    });
  }

  private get playtest(): boolean { return !!this.startData.playtest; }
  /** 人被别的事占着：死了、通关画面、换层、长大仪式、出场动画、跳出画面去了 3D 世界 */
  private get busy(): boolean { return this.awaitingEntrance || this.respawn.dead || this.won || this.leaving || this.growth.growing || this.respawn.respawning || this.popOut.away; }
  /** 有机制接管了按键和人（比如节奏关卡开打了，见 Mechanic.takesControl） */
  private get controlled(): boolean { return this.mechs.some(m => m.takesControl?.()); }
  /** 人不归玩家管的时候：被别的事占着，或者被机制接管了 */
  private get frozen(): boolean { return this.busy || this.controlled; }
  /** 主角出场（骷髅手放进来）；存档里人在 3D 世界：出场之后接着跳出去 */
  private enterPlayer(): void {
    this.respawn.appear(this.startData.origin ? 'floor' : 'start');
    if (!this.playtest && store.getState().run.realm === 'deep') this.popOut.request();
  }

  /** 标题画面选了「开始」：放主角出场，换成这一层的音乐 */
  private enter(): void {
    if (!this.awaitingEntrance) return;
    this.awaitingEntrance = false;
    this.player.setVisible(true);
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    this.music.playBase();
    this.enterPlayer();
    this.saveCheckpoint();
  }

  /** 标题画面选了「开始游戏」/「继续游戏」：没有存档（或试玩）就在这里出场；有存档的话继续 = 回到存档的房间，开始 = 清掉存档从头来 */
  private startRun(mode: 'new' | 'continue'): void {
    const run = store.getState().run;
    if (this.playtest || !run.active) { this.enter(); return; }
    if (mode === 'continue') this.scene.restart(resumeData(this.project, run));
    else this.newGame();
  }

  private hasFlag(f: StoryFlag): boolean { return this.playtest ? this.localFlags.has(f) : !!store.getState().run.flags[f]; }
  private setStoryFlag(f: StoryFlag): void {
    if (this.hasFlag(f)) return;
    if (this.playtest) this.localFlags.add(f); else store.dispatch(setFlag(f));
    this.flagWatchers.forEach(cb => cb(f));
  }
  private storyFlags(): Record<string, true> {
    return this.playtest ? Object.fromEntries([...this.localFlags].map(f => [f, true as const])) : store.getState().run.flags;
  }

  /** 人不在画面里的时候死不了（落石砸不到 3D 世界里的人） */
  private die(reason: DeathKey): void { if (!this.popOut.away) this.respawn.die(reason); }

  // ---------- 给机制用的上下文 ----------
  private buildContext(): PlayContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 上下文里的 getter 要读场景的当前值
    const s = this;
    return {
      scene: this, cfg: this.cfg, project: this.project, floor: this.floor, model: this.model, start: this.startData, carried: id => this.startData.carry?.[id],
      terrain: this.terrain, fuses: this.fuses, fog: this.fog, sparks: this.sparks, music: this.music, dialogue: this.dialogue, rooms: this.rooms,
      get player() { return s.player; },
      get enemies() { return s.enemies; },
      get debris() { return s.debris; },
      get dead() { return s.respawn.dead; },
      get won() { return s.won; },
      get leaving() { return s.leaving; },
      get appearing() { return s.respawn.respawning; },
      get playtest() { return s.playtest; },
      get busy() { return s.busy || s.crumple.active; },
      get away() { return s.popOut.away; },
      popOut: from => this.popOut.request(from),
      held: () => this.controls.read(),
      get entry() { return s.respawn.entry; },
      set entry(e) { s.respawn.entry = e; },
      stats: this.stats,
      pushStats: () => store.dispatch(setStats({ ...this.stats })),
      saveCheckpoint: () => this.saveCheckpoint(true),
      die: reason => this.die(reason),
      hurt: (reason, from) => this.health.hurt(reason, from),
      addMaxHearts: n => this.health.addMax(n),
      win: final => this.win(final),
      enter: () => this.enter(),
      newGame: () => this.newGame(),
      startRun: mode => this.startRun(mode),
      solves: {
        solve: (r, node) => this.solves.solve(r, node),
        has: node => this.solves.has(node),
      },
      story: {
        has: f => this.hasFlag(f),
        flag: f => this.setStoryFlag(f),
        watch: cb => { this.flagWatchers.push(cb); },
      },
      goToFloor: (id, via) => this.goToFloor(id, via),
      igniteFuses: ends => this.fuses.ignite(ends, this.terrain, cells => this.onFuseBurn(cells)),
      fx: {
        flash: (text, color, params) => this.flash(text, color, params),
        popScore: (x, y, n) => this.popScore(x, y, n),
        fogDirty: () => { this.fogDirty = true; },
        light: (x, y, kind) => this.sceneFx.light(x, y, kind),
        landed: cells => this.tileFx.landed(cells),
      },
      hud: {
        score: n => store.dispatch(setScore(n)),
        boss: v => store.dispatch(setBoss(v)),
        bossIntro: v => store.dispatch(setBossIntro(v)),
        hearts: v => { if (v) store.dispatch(setHearts(v)); else this.health.reset(); },
        rhythm: v => store.dispatch(setRhythm(v)),
        rhythmMode: mode => store.dispatch(setRhythmMode(mode)),
        whiteout: () => store.dispatch(whiteout()),
        editorShell: v => store.dispatch(setEditorShell(v)),
      },
      settings: {
        config: () => store.getState().config,
        setConfig: patch => store.dispatch(setConfig(patch)),
      },
      mech: <T extends Mechanic>(id: string) => this.mechById.get(id) as T | undefined,
      blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= this.terrain.w || cy >= this.terrain.h || this.terrain.isSolid(cx, cy) || this.blockedByMechanics(cx, cy),
      blockedByMechanics: (cx, cy) => this.blockedByMechanics(cx, cy),
      occupied: (cx, cy) => this.mechs.some(m => m.occupies?.(cx, cy)),
      weighs: (cx, cy) => this.mechs.some(m => m.weighs?.(cx, cy)),
      platformShift: b => shiftUnder(b, this.solids.groups('platform')),
      solids: this.solids,
      loose: this.loose,
    };
  }

  private blockedByMechanics(cx: number, cy: number): boolean { return this.mechs.some(m => m.blocks?.(cx, cy)); }

  // ---------- 每帧 ----------
  update(time: number, delta: number): void {
    const dt = delta / 1000;
    this.terrain.updateChunks(dt);
    this.loose.update(time);   // 地上的东西：被埋了挪出来、落地弹一下
    this.enemies.update();
    this.debris.update();
    this.dialogue.update(time);
    this.mechs.forEach(m => m.update?.(time, dt));
    this.solves.update(time);
    this.updateFog();
    this.growth.update(time);   // 回到出生点、落了地再开始长
    this.popOut.update();
    this.backdrop.update(this.player.x, this.player.y, !this.awaitingEntrance);
    if (this.frozen) return;

    const r = this.rooms.of(this.player.x, this.player.y);
    if (!this.rooms.same(r, this.rooms.current)) { this.respawn.onRoomChanged(r); this.updateFog(); this.saveCheckpoint(); }   // 同一帧把新房间的迷雾画好，不给它露脸的机会

    const input = this.controls.read();
    this.controls.pollDown(input);
    this.floorMech.move(input, time, this.dialogue.talking);   // 对话中站着别动
    this.health.update(time);   // 挨打弹开期间盖掉方向键的速度，变红、闪烁
    this.debris.handlePlayerContact();
    if (this.respawn.dead) return;
    const hazard = touchingHazard(this.terrain, this.player.body);
    if (hazard) {   // 尖刺：扣一颗心、往上弹开（扣光才死）
      this.health.hurt(hazard, { x: this.player.x, y: this.player.body.bottom + 8 });
      if (this.respawn.dead) return;
    }
    for (const m of this.mechs) {
      if (this.frozen) break;
      m.updateAlive?.(time, dt);
    }
  }

  private updateFog(): void {
    if (!this.fog) return;
    const now = this.time.now;
    const T = this.cfg.tile, b = this.player.body;
    const tx = Math.floor(b.center.x / T), ty = Math.floor(b.center.y / T);
    const carried = this.respawn.respawning;   // 复活时被骷髅手拎着走：路过的迷雾区不算踏进去
    if (tx !== this.fogTile.x || ty !== this.fogTile.y || this.fogDirty || carried !== this.fogCarried) {
      this.fogTile = { x: tx, y: ty }; this.fogDirty = false; this.fogCarried = carried;
      this.fog.compute(tx, ty, now, !carried);
    }
    this.fog.draw(now);
  }

  // ---------- 暂停（ESC / 手柄 Start） ----------
  /** 开暂停菜单（ui/PauseMenu）：只在正常玩的时候开（标题画面、死了、通关画面、换层、攥纸团、节奏关卡接管时不开）；场景整个停下 */
  private pause(): void {
    if (store.getState().hud.mode !== 'playing' || this.leaving || this.crumple.active || this.controlled || performance.now() - this.resumedAt < RESUME_GUARD_MS) return;
    store.dispatch(setPaused(true));
    this.scene.pause();
  }

  /** 暂停菜单关掉了：接着跑 */
  private resume(): void {
    if (!this.scene.isPaused()) return;
    this.resumedAt = performance.now();
    this.scene.resume();
    store.dispatch(setPaused(false));
  }

  // ---------- 重置（活着按 R） ----------
  /**
   * R 键重置房间：config.resetCrumple 开着就先放攥纸团特效，纸团扔掉后重置，新房间淡入完再把人放下来。
   * 人在 3D 世界时也能按：画面照样被攥掉、房间重置，人留在 3D 世界（2D 里的人回到复活点藏着）
   */
  private requestRoomReset(): void {
    const reset = (fadeMs = 0) => this.respawn.resetByConfig(fadeMs);
    if (this.cfg.resetCrumple && (!this.frozen || this.popOut.away) && this.crumple.start(reset)) return;
    reset();
  }

  // ---------- 通关 / 下一关 / 换层 ----------
  /** final=false 是"假通关"：按一下继续玩；final=true 是最后一层的真结束 */
  private win(final: boolean): void {
    if (this.won) return;
    this.won = true; this.wonFinal = final;
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const hat = this.collectCarry().hat === true;   // 通关画面上画不画帽子
    store.dispatch(setStats({ ...this.stats }));
    // 这一层的终点是一幕的结局：不弹「通关！」，换成那一幕的庆祝画面（「继续」能接着玩，这一局不结束）
    const ending = ENDINGS[this.floor.id];
    if (ending) {
      this.wonFinal = false;
      this.setStoryFlag(STORY.act1Won);
      store.dispatch(setMode({ mode: 'won', ending: { id: ending, choices: endingChoices(this.storyFlags()) }, playtest: this.playtest }));
      return;
    }
    store.dispatch(setMode({ mode: 'won', final, stage: this.player.stage, hat }));
    if (final && !this.playtest) store.dispatch(clearRun());   // 真通关：这一局结束，下次从头开始
  }

  /** 结局画面上选了一项：继续 = 接着玩（角落那段墙塌开）；重新开始 = 清空存档从头玩；退出 = 回标题画面 */
  private onEndingChoice(c: EndingChoice): void {
    if (!this.won || !ENDINGS[this.floor.id]) return;
    if (c === 'continue') {
      if (this.hasFlag(STORY.continueRemoved)) return;   // 「继续」已经被 GM 扔掉了
      this.setStoryFlag(STORY.act1Continued);
      this.continueAfterWin(true);
    } else if (c === 'restart') this.newGame();
    else if (this.playtest) this.exitPlaytest();
    else bridge.emit(EVT.toTitle);
  }

  /** 正式 checkpoint 前记录当前入口供继续游戏；触发节点后普通换房间不能覆盖它。 */
  private saveCheckpoint(explicit = false): void {
    if (!explicit && (this.worldCheckpoint?.kind === 'checkpoint' || this.checkpointPending?.kind === 'checkpoint')) return;
    this.checkpointPending = { entry: explicit ? null : { ...this.respawn.entry }, kind: explicit ? 'checkpoint' : 'entry' };
  }

  /** 物理和本帧拾取/钥匙消耗都结束后捕获，避免快照夹在两个物品处理步骤之间。 */
  private writeCheckpoint = (): void => {
    const pending = this.checkpointPending;
    if (!pending) return;
    this.checkpointPending = null;
    const entry = pending.entry ?? { x: this.player.x, y: this.player.y, vx: this.player.body.velocity.x, vy: this.player.body.velocity.y };
    const world = captureCheckpoint({
      floor: this.floor, tile: this.cfg.tile, entry, stage: this.player.stage, kind: pending.kind,
      carry: this.collectCarry(), stats: this.stats, flags: this.storyFlags(), fog: this.fog?.toState() ?? null,
      terrain: this.terrain, fuses: this.fuses, enemies: this.enemies, debris: this.debris,
      rooms: this.rooms, solves: this.solves, mechs: [...this.mechById],
    });
    this.worldCheckpoint = world;
    this.persistWorldCheckpoint(world);
  };

  private persistWorldCheckpoint(world: WorldCheckpoint): void {
    if (this.playtest) return;
    const room = this.rooms.of(world.entry.x, world.entry.y);
    store.dispatch(checkpoint({ floorId: world.floorId, room, stage: world.stage, carry: world.carry, stats: world.stats, flags: world.flags, world }));
  }

  private applyWorldCheckpoint(world: WorldCheckpoint): void {
    this.terrain.restoreCheckpoint(world.terrain);
    this.enemies.restoreCheckpoint(world.enemies);
    this.mechById.forEach((m, id) => { if (id in world.mechs) m.restoreCheckpoint?.(world.mechs[id]); });
    this.debris.restoreCheckpoint(world.paper);
    this.fuses.restoreCheckpoint(world.fuse, this.terrain, cells => {
      this.onFuseBurn(cells);
    });
    this.rooms.restoreCheckpoint(world.awake);
    this.solves.restoreNodes(world.nodes);
    this.fogDirty = true;
  }

  /** 通过同一个场景重建路径恢复全部物件，旧定时器和碰撞体随场景一起销毁。 */
  private restoreWorldCheckpoint(): boolean {
    const world = this.worldCheckpoint;
    if (!world || world.kind !== 'checkpoint' || !checkpointMatches(world, this.floor, this.cfg.tile, this.terrain.w, this.terrain.h)) return false;
    this.persistWorldCheckpoint(world);
    this.localFlags = new Set(Object.keys(world.flags) as StoryFlag[]);
    this.scene.restart({
      project: this.project, floorId: this.floor.id, playtest: this.playtest,
      startRoom: this.rooms.of(world.entry.x, world.entry.y), entry: { ...world.entry },
      stage: world.stage, carry: world.carry, stats: world.stats, world,
      origin: this.startData.origin ?? this.startData,
    } satisfies StartGameData);
    return true;
  }

  /** 各机制要带走的东西（Mechanic.persist）：机制 id → 数据 */
  private collectCarry(): CarryOver {
    const out: CarryOver = {};
    this.mechById.forEach((m, id) => { const v = m.persist?.(); if (v !== undefined) out[id] = v; });
    return jsonCarry(out);
  }

  /** 通关画面关掉、接着玩。结局画面（ending）只认画面上的「继续」（fromEnding），跳、关弹窗都不算 */
  private continueAfterWin(fromEnding = false): void {
    if (!this.won || this.wonFinal || (ENDINGS[this.floor.id] && !fromEnding)) return;
    this.won = false;
    this.player.unfreeze();
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
  }

  /** 假通关弹窗里点「进入下一关」：跳到下一层（不长大；长大的仪式 Growth 留着以后做成药水） */
  private fakeNextLevel(): void {
    if (!this.won || this.wonFinal || this.leaving || this.respawn.dead) return;
    const next = floorAfter(this.project, this.floor.id);
    if (!next) return;
    this.won = false;
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    this.goToFloor(next.id);
  }

  /** 换层。给了 via（门的位置）就先来一段旋涡：画面转着拉近门，人和东西都被吸进去 */
  private goToFloor(id: string, via?: Point): void {
    if (this.leaving) return;
    if (!this.project.floors.some(f => f.id === id)) {
      // 这份地图里没有那一层（编辑器里的地图比打包的旧）：从打包的默认地图里借过来
      const borrowed = DEFAULT_PROJECT.floors.find(f => f.id === id);
      if (!borrowed) { this.flash('msg.noFloor', hex(Colors.rose)); return; }
      this.project = { ...this.project, floors: [...this.project.floors, borrowed] };
    }
    this.leaving = true;
    this.dialogue.end();
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const cam = this.cameras.main;
    const restart = () => {
      const data: StartGameData = { project: this.project, floorId: id, playtest: this.playtest, announceFloor: true, stats: { ...this.stats }, carry: this.collectCarry(), stage: this.player.stage, origin: this.origin };
      this.scene.restart(data);
    };
    const fade = (ms: number) => { cam.fadeOut(ms, 0, 0, 0); cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, restart); };
    if (!via) { fade(350); return; }
    vortex(this.ctx, via, this.mechs.flatMap(m => m.vortexTargets?.() ?? []), () => fade(250));
  }

  /** 这一局的起点（第一次进场的启动数据） */
  private get origin(): StartGameData { return this.startData.origin ?? this.startData; }

  /** 清空存档、开一局新的（结局画面「重新开始」、标题画面清除进度后「开始」）；试玩从试玩的起点重来 */
  private newGame(): void {
    if (this.playtest) { this.restartRun(); return; }
    store.dispatch(clearRun());
    this.scene.restart({ project: this.project, playtest: false });
  }

  /** 再来一次：从这一局的起点重开 */
  private restartRun(): void {
    this.scene.restart({ ...this.origin });
  }

  private exitPlaytest(): void {
    bridge.emit(EVT.playtestExit);
    this.scene.start(SCENE.editor);
  }

  // ---------- 引线 / 效果 ----------
  /** 引线每烧一跳：火花 + 迷雾要重算 + 通知机制（Boss 被烧到会扣血） */
  private onFuseBurn(cells: FuseBurnCell[]): void {
    this.fogDirty = true;
    const T = this.cfg.tile;
    cells.forEach(c => this.sparks.explode(5, c.x * T + T / 2, c.y * T + T / 2));
    this.mechs.forEach(m => m.onFuseBurn?.(cells));
    store.dispatch(setStats({ ...this.stats }));
  }

  /** 挂着的砖（尖刺）因为下面没了而碎掉：那种砖的碎块，迷雾重算 */
  private onCellsBroken(cells: RemovedCell[]): void {
    this.tileFx.broken(cells.map(c => ({ x: c.x, y: c.y, mat: c.def.debris })));
    this.fogDirty = true;
  }

  /** text 是 i18n key；地图里的文字（层名）先过 mapText 再传进来，tr 找不到 key 会原样显示 */
  private flash(text: string, color: string, params?: Record<string, unknown>): void { store.dispatch(flash({ text: tr(text, params), color })); }

  /** 飘起来的分数 */
  private popScore(x: number, y: number, n: number): void {
    const t = this.add.text(x, y, String(n), { fontSize: '14px', color: '#4cf0f0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 900, ease: 'Sine.out', onComplete: () => t.destroy() });
  }
}
