// ===== 游戏场景：只做编排 =====
// 核心：地形、碎块、怪物、引线、迷雾、房间与镜头、死亡 / 重置 / 通关、存档、按键。
// 玩法都在 game/mechanics/ 里：一个层机制（这一层怎么动）+ 若干通用机制（Boss、钥匙、角色……），
// 这里按生命周期调用它们的钩子，不认识具体机制。
import Phaser from 'phaser';
import type { AppearReason, CarryOver, CellRef, CoreHost, EnemySpawn, EntryState, Floor, GameConfig, Point, Project, RoomCoord, WorldModel } from '@/type';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { entityRows, fogRows, fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, SCENE, type CrumpleDone, type StartGameData } from '@/game/bridge';
import { Player } from '@/sprite';
import { createSparkEmitter, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/game/input';
import { Music } from '@/game/Music';
import { DEFAULT_MUSIC } from '@/asset';
import { flash, setBoss, setControls, setDialogue, setMode, setPlace, setRoomKey, setScore, setStats } from '@/redux/slices/hudSlice';
import { mapText, tr } from '@/i18n';
import { resetProgress } from '@/redux/slices/progressSlice';
import { floorMechanicOf, globalMechanicsOf, type FloorMechanic, type FuseBurnCell, type Mechanic, type MechanicDef, type MoveInput } from '@/game/mechanics/define';
import type { PlayContext } from '@/game/core/PlayContext';
import { Dialogue } from '@/game/core/Dialogue';
import { Enemies } from '@/game/core/Enemies';
import { Debris } from '@/game/core/Debris';
import { standingSpot, touchingHazard } from '@/game/core/rooms';
import { buildBackground } from '@/game/core/backdrop';
import { applySceneFx, type SceneFx } from '@/game/core/sceneFx';
import { vortex } from '@/game/core/vortex';
import { playRespawnHand } from '@/game/core/respawnHand';
import { MAX_STAGE, STAGE_EXTRA } from '@/sprite/Player';

type PressKey = 'SPACE' | 'UP' | 'W' | 'touch';

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
  private fogDirty = true;
  /** 画面效果（暗角、微尘） */
  private sceneFx!: SceneFx;
  private player!: Player;
  private enemies!: Enemies;
  private debris!: Debris;
  private sparks!: SparkEmitter;
  private music!: Music;
  private dialogue!: Dialogue;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'A' | 'D' | 'W' | 'S', Phaser.Input.Keyboard.Key>;

  private spawnPoints: Point[] = [];
  private roomW = 20; private roomH = 20; private roomPxW = 640; private roomPxH = 640;
  private room: RoomCoord = { rx: 0, ry: 0 };
  private entry: EntryState = { x: 0, y: 0, vx: 0, vy: 0 };
  private prevEntry: EntryState | null = null;
  private lastResetAt: number | null = null;

  private dead = false;
  private diedAt = 0;
  private won = false;
  /** 通关画面是不是真的结束（否则按一下继续玩） */
  private wonFinal = false;
  /** 假通关的仪式进行中：进场后先长大，长完才弹通关。期间不响应输入 */
  private growing = false;
  private growTween: Phaser.Tweens.Tween | null = null;
  /** 回到出生点的时刻：落地（或最多等 1 秒）后开始长；null = 还在淡出、没回到出生点 */
  private growSince: number | null = null;
  /** 正在切层（淡出中），不再响应输入 */
  private leaving = false;
  /** 出场动画中（骷髅手把人放进来）：人冻着，不响应输入、R，也不会死 */
  private respawning = false;
  /** 第四面墙特效放着 / 已经冻住了 */
  private crumpling = false;
  private crumpleFrozen = false;
  /** 特效放完要做的事 */
  private crumpleAfter: ((fadeMs: number) => void) | null = null;
  private stats = { jumps: 0, destroyed: 0 };

  constructor() { super(SCENE.game); }

  init(data: StartGameData): void {
    this.startData = data;
    if (!data.origin) store.dispatch(resetProgress());   // 这一局的第一个场景（开始游戏 / 再来一次 / 试玩）：进度清空；换层带着 origin，不清
    this.project = data.project;
    this.floor = (data.floorId && this.project.floors.find(f => f.id === data.floorId)) || this.project.floors[0];
    this.mechs = []; this.mechById = new Map();
    this.fog = null; this.fogTile = { x: -1, y: -1 }; this.fogDirty = true;
    this.spawnPoints = [];
    this.stats = { jumps: data.stats?.jumps ?? 0, destroyed: data.stats?.destroyed ?? 0 };
    this.dead = false; this.won = false; this.wonFinal = false; this.leaving = false; this.growing = false; this.growTween = null; this.respawning = false;
    this.prevEntry = null; this.lastResetAt = null;
  }

  create(): void {
    this.cfg = store.getState().config;
    const T = this.cfg.tile;

    // ---- 机制：层机制一个 + 启用的通用机制；建地形之前先让它们改模型 ----
    const defs: MechanicDef[] = [floorMechanicOf(this.floor), ...globalMechanicsOf(this.floor)];
    const baked = new Map<string, unknown>();
    let model = this.floor.model;
    defs.forEach(d => { if (!d.bake) return; const r = d.bake(model); model = r.model; baked.set(d.id, r.data); });
    this.model = model;

    // ---- 画布 = 一个房间；每层房间尺寸可以不同 ----
    this.roomW = model.roomW; this.roomH = model.roomH;
    this.roomPxW = this.roomW * T; this.roomPxH = this.roomH * T;
    resizeGame(this.game, this.roomPxW, this.roomPxH);
    this.cameras.main.setSize(this.roomPxW, this.roomPxH);
    this.cameras.main.setZoom(1).setRotation(0);

    // ---- 地形：地图本身就是"原始状态"（R 重置用） ----
    const rows = worldRows(model);
    this.terrain = new Terrain({
      scene: this,
      onChunkFall: ch => this.debris.onChunkFall(ch),
      onChunkLand: ch => this.debris.onChunkLand(ch),
      catchChunk: ch => this.debris.catchChunk(ch),
      onCellsBroken: cells => this.onCellsBroken(cells),
      occupied: (x, y) => this.mechs.some(m => m.occupies?.(x, y)),
      onChunkRemoved: ch => this.debris.onChunkRemoved(ch),
      drawnElsewhere: (x, y) => this.mechs.some(m => m.drawsCell?.(x, y)),
    }, rows, { tile: T, explosionRadius: this.cfg.explosionRadius, chunkGravity: this.cfg.chunkGravity, chunkMaxFall: this.cfg.chunkMaxFall });
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    buildBackground(this, levelW, levelH);
    // 画面效果（config.sceneFx）：墙的投影、体积感、暗角、微尘
    if (this.cfg.sceneFx.shadow) this.terrain.enableShadow(4, 5, 0.35);
    if (this.cfg.sceneFx.depth) this.terrain.enableShading();
    const fxRooms = model.layout.flatMap((row, ry) => row.flatMap((key, rx) => (key ? [{
      x: rx * this.roomPxW, y: ry * this.roomPxH, w: this.roomPxW, h: this.roomPxH, key, dark: !!model.roomFlags?.[key]?.fog,
    }] : [])));
    this.sceneFx = applySceneFx(this, this.cfg.sceneFx, fxRooms, T);
    this.fuses = new FuseNet(this, fuseRows(model), { tile: T, delayMs: this.cfg.fuseDelayMs, light: (x, y) => this.sceneFx.light(x, y, 'ember') });

    // 迷雾层：有全屋暗的房间（roomFlags.fog），或者画了迷雾区，才建；普通房间里只有迷雾区是黑的
    const darkRooms = new Set(Object.entries(model.roomFlags ?? {}).filter(([, f]) => f.fog).map(([k]) => k));
    const zones = fogRows(model);
    if (darkRooms.size || zones.some(r => /[^.]/.test(r))) {
      this.fog = new FogOfWar(this, this.terrain.grid, zones.map(r => r.split('')), {
        tile: T, roomW: this.roomW, roomH: this.roomH, radius: this.cfg.fogRadius, memoryAlpha: this.cfg.fogMemoryAlpha, unseenAlpha: this.cfg.fogUnseenAlpha,
        keyAt: (rx, ry) => roomKeyAt(model, rx, ry), darkRooms,
      });
    }

    this.sparks = createSparkEmitter(this);
    this.music = new Music(this, this.cfg.musicVolume, this.floor.music ?? DEFAULT_MUSIC);
    this.dialogue = new Dialogue(() => ({ y: this.player.y - this.cameras.main.scrollY, h: this.cameras.main.height }));
    this.ctx = this.buildContext();
    this.enemies = new Enemies(this.ctx);
    this.debris = new Debris(this.ctx);

    // ---- 机制实例 ----
    defs.forEach(d => { const m = d.create(this.ctx, baked.get(d.id)); this.mechs.push(m); this.mechById.set(d.id, m); });
    this.floorMech = this.mechs[0] as FloorMechanic;

    // ---- 物件：每个字符问注册表；属于机制的交给机制实例，核心物件交给场景 ----
    const core: CoreHost = { addSpawnPoint: p => this.spawnPoints.push(p), addEnemy: (sp: EnemySpawn) => this.enemies.addSpawn(sp) };
    entityRows(model).forEach((row, y) => [...row].forEach((c, x) => {
      const cls = classify(c);
      if (cls.kind !== 'entity') return;
      const target = cls.def.mechanic ? this.mechById.get(cls.def.mechanic) : core;
      if (!target) return;   // 机制没在这一层启用（比如平台层里放了豆子）
      cls.def.spawn(target, { x: x * T + T / 2, y: y * T + T / 2, cell: { x, y, rx: Math.floor(x / this.roomW), ry: Math.floor(y / this.roomH) } });
    }));

    // ---- 玩家：读档入口 > 指定起始房间（里面的出生点，否则找个能站的地方）> 全图出生点 > 兜底 ----
    const startRoom = this.startData.startRoom ?? null;
    let start: Point | null = this.startData.entry ?? null;
    if (!start && startRoom) start = this.spawnPoints.find(p => this.sameRoom(this.roomOf(p.x, p.y), startRoom)) ?? standingSpot(this.terrain, startRoom, this.roomW, this.roomH, this.cfg.playerHeight);
    start ??= this.spawnPoints[0] ?? { x: 2 * T, y: 4 * T };
    this.player = new Player(this, start.x, start.y, this.cfg);
    if (this.startData.stage) this.player.setStage(this.startData.stage);   // 上一层已经长大了：带过来
    if (this.startData.entry) this.player.setVelocity(this.startData.entry.vx, this.startData.entry.vy);
    this.physics.world.gravity.y = this.floorMech.gravity ?? this.cfg.gravity;
    if (this.floorMech.collideTerrain) this.physics.add.collider(this.player, this.terrain.layer, undefined, this.terrain.landsOnOneWay);
    this.physics.add.collider(this.player, this.debris.platforms);

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);

    // ---- HUD（机制 start 里可能会改，比如吃豆人显示分数） ----
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setPlace(mapText(this.floor.place ?? '')));
    store.dispatch(setControls(defs[0].controls)); store.dispatch(setScore(null));
    store.dispatch(setStats(this.stats));

    this.mechs.forEach(m => m.start?.());
    this.mechs.forEach(m => m.onRoomChanged?.(this.room));

    this.bindInput();
    // 玩家出场：换层带着 origin（这一局早就开始了），没有就是这一局的第一次出现
    this.appear(this.startData.origin ? 'floor' : 'start');

    this.music.playBase();
    let lastVol = this.cfg.musicVolume;
    const unsubVol = store.subscribe(() => { const v = store.getState().config.musicVolume; if (v !== lastVol) { lastVol = v; this.music.setVolume(v); } });
    if (this.startData.announceFloor) {
      this.cameras.main.fadeIn(350, 0, 0, 0);
      this.flash(mapText(this.floor.name), '#ffd166');
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mechs.forEach(m => m.destroy?.());
      unsubVol();
      this.music.stop();
      store.dispatch(setMode({ mode: 'idle' })); store.dispatch(setBoss(null)); store.dispatch(setDialogue(null));
    });
  }

  private get playtest(): boolean { return !!this.startData.playtest; }

  // ---------- 给机制用的上下文 ----------
  private buildContext(): PlayContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 上下文里的 getter 要读场景的当前值
    const s = this;
    const rooms: PlayContext['rooms'] = {
      get current() { return s.room; },
      get w() { return s.roomW; }, get h() { return s.roomH; }, get pxW() { return s.roomPxW; }, get pxH() { return s.roomPxH; },
      of: (x, y) => this.roomOf(x, y),
      same: (a, b) => this.sameRoom(a, b),
      key: r => roomKeyAt(this.model, r.rx, r.ry),
      flag: (r, flag) => { const k = roomKeyAt(this.model, r.rx, r.ry); return !!k && !!this.model.roomFlags?.[k]?.[flag]; },
      standingSpot: r => standingSpot(this.terrain, r, this.roomW, this.roomH, this.cfg.playerHeight),
      enter: (r, instant) => this.enterRoom(r, instant),
    };
    return {
      scene: this, cfg: this.cfg, project: this.project, floor: this.floor, model: this.model, start: this.startData,
      terrain: this.terrain, fuses: this.fuses, fog: this.fog, sparks: this.sparks, music: this.music, dialogue: this.dialogue, rooms,
      get player() { return s.player; },
      get enemies() { return s.enemies; },
      get debris() { return s.debris; },
      get dead() { return s.dead; },
      get won() { return s.won; },
      get leaving() { return s.leaving; },
      get appearing() { return s.respawning; },
      get playtest() { return s.playtest; },
      get entry() { return s.entry; },
      set entry(e) { s.entry = e; },
      stats: this.stats,
      pushStats: () => store.dispatch(setStats({ ...this.stats })),
      die: reason => this.die(reason),
      win: final => this.win(final),
      goToFloor: (id, via) => this.goToFloor(id, via),
      igniteFuses: ends => this.fuses.ignite(ends, this.terrain, cells => this.onFuseBurn(cells)),
      fx: {
        flash: (text, color, params) => this.flash(text, color, params),
        popScore: (x, y, n) => this.popScore(x, y, n),
        fogDirty: () => { this.fogDirty = true; },
        light: (x, y, kind) => this.sceneFx.light(x, y, kind),
      },
      hud: {
        score: n => store.dispatch(setScore(n)),
        boss: v => store.dispatch(setBoss(v)),
      },
      mech: <T extends Mechanic>(id: string) => this.mechById.get(id) as T | undefined,
      blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= this.terrain.w || cy >= this.terrain.h || this.terrain.isSolid(cx, cy) || this.blockedByMechanics(cx, cy),
      blockedByMechanics: (cx, cy) => this.blockedByMechanics(cx, cy),
      occupied: (cx, cy) => this.mechs.some(m => m.occupies?.(cx, cy)),
      weighs: (cx, cy) => this.mechs.some(m => m.weighs?.(cx, cy)),
      addTerrainCollider: group => {
        const others = [this.player, this.enemies.group, ...this.mechs.flatMap(m => m.terrainBodies?.() ?? [])];
        others.forEach(o => this.physics.add.collider(o, group));
      },
    };
  }

  private blockedByMechanics(cx: number, cy: number): boolean { return this.mechs.some(m => m.blocks?.(cx, cy)); }

  // ---------- 按键 ----------
  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D', W: 'W', S: 'S' }) as GameScene['keys'];
    const press = (key: PressKey) => { if (this.respawning) return; if (this.won) this.continueAfterWin(); else this.floorMech.onPress(key, this.time.now); };
    const touchPress = () => press('touch');
    kb.on('keydown-SPACE', () => press('SPACE'));
    kb.on('keydown-UP', () => press('UP'));
    kb.on('keydown-W', () => press('W'));
    bridge.on(TOUCH_JUMP, touchPress); bridge.on(TOUCH_ACTION, touchPress);
    // 换层（旋涡、淡出）和长大的过程中不响应 R：重置会清掉它们正在等的计时器和镜头，画面就卡在半路
    kb.on('keydown-R', () => { if (this.won || this.leaving || this.growing || this.respawning || this.crumpling) return; if (this.dead) this.resetAfterDeath(); else this.requestRoomReset(); });
    const requestReset = () => { if (this.dead && !this.won) this.resetAfterDeath(); };
    const continueGame = () => { if (this.won) this.continueAfterWin(); };
    const restartGame = () => this.restartRun();
    const nextLevel = () => this.fakeNextLevel();
    bridge.on(EVT.requestReset, requestReset); bridge.on(EVT.continueGame, continueGame); bridge.on(EVT.restartGame, restartGame); bridge.on(EVT.nextLevel, nextLevel);
    const exitPlaytest = () => { if (this.playtest) this.exitPlaytest(); };
    if (this.playtest) kb.on('keydown-ESC', exitPlaytest);
    bridge.on(EVT.requestPlaytestExit, exitPlaytest);
    const crumpleFreeze = () => this.freezeForCrumple();
    const crumpleDone = (d: CrumpleDone) => this.endCrumple(d);
    bridge.on(EVT.crumpleFreeze, crumpleFreeze); bridge.on(EVT.crumpleDone, crumpleDone);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bridge.off(EVT.requestPlaytestExit, exitPlaytest);
      bridge.off(EVT.crumpleFreeze, crumpleFreeze); bridge.off(EVT.crumpleDone, crumpleDone);
      bridge.off(TOUCH_JUMP, touchPress); bridge.off(TOUCH_ACTION, touchPress);
      bridge.off(EVT.requestReset, requestReset); bridge.off(EVT.continueGame, continueGame); bridge.off(EVT.restartGame, restartGame); bridge.off(EVT.nextLevel, nextLevel);
      touch.left = false; touch.right = false; touch.up = false; touch.down = false;
    });
  }

  private readInput(): MoveInput {
    const c = this.cursors, k = this.keys;
    return {
      left: c.left.isDown || k.A.isDown || touch.left,
      right: c.right.isDown || k.D.isDown || touch.right,
      up: c.up.isDown || k.W.isDown || touch.up,
      down: c.down.isDown || k.S.isDown || touch.down,
    };
  }

  // ---------- 每帧 ----------
  update(time: number, delta: number): void {
    const dt = delta / 1000;
    this.terrain.updateChunks(dt);
    this.enemies.update();
    this.debris.update(dt);
    this.dialogue.update(time);
    this.mechs.forEach(m => m.update?.(time, dt));
    this.updateFog();
    if (this.growing && this.growSince !== null && !this.growTween && (this.player.onGround || time - this.growSince > 1000)) this.startGrowth();   // 回到出生点、落了地再开始长
    if (this.dead || this.won || this.leaving || this.growing || this.respawning) return;

    const r = this.roomOf(this.player.x, this.player.y);
    if (!this.sameRoom(r, this.room)) { this.onRoomChanged(r); this.updateFog(); }   // 同一帧把新房间的迷雾画好，不给它露脸的机会

    this.floorMech.move(this.readInput(), time, this.dialogue.talking);   // 对话中站着别动
    this.debris.handlePlayerContact();
    if (this.dead) return;
    const hazard = touchingHazard(this.terrain, this.player.body);
    if (hazard) { this.die(hazard); return; }
    for (const m of this.mechs) {
      if (this.dead || this.won || this.leaving) break;
      m.updateAlive?.(time, dt);
    }
  }

  private updateFog(): void {
    if (!this.fog) return;
    const now = this.time.now;
    const T = this.cfg.tile, b = this.player.body;
    const tx = Math.floor(b.center.x / T), ty = Math.floor(b.center.y / T);
    if (tx !== this.fogTile.x || ty !== this.fogTile.y || this.fogDirty) {
      this.fogTile = { x: tx, y: ty }; this.fogDirty = false;
      this.fog.compute(tx, ty, now);
    }
    this.fog.draw(now);
  }

  // ---------- 房间 ----------
  private roomOf(x: number, y: number): RoomCoord { return { rx: Math.floor(x / this.roomPxW), ry: Math.floor(y / this.roomPxH) }; }
  private sameRoom(a: RoomCoord, b: RoomCoord): boolean { return a.rx === b.rx && a.ry === b.ry; }

  private enterRoom(r: RoomCoord, instant: boolean): void {
    this.room = r;
    this.fog?.setRoom(r);
    const sx = r.rx * this.roomPxW, sy = r.ry * this.roomPxH;
    this.sceneFx.setRoom(sx, sy, this.roomPxW, this.roomPxH);
    this.tweens.killTweensOf(this.cameras.main);
    if (instant) this.cameras.main.setScroll(sx, sy);
    else this.tweens.add({ targets: this.cameras.main, scrollX: sx, scrollY: sy, duration: this.cfg.roomPanMs, ease: 'Sine.out' });
    store.dispatch(setRoomKey(roomKeyAt(this.model, r.rx, r.ry) ?? '?'));
  }

  /** 进入新房间：记录入口状态（位置 + 速度），重置时回到这里；顺便存档 */
  private onRoomChanged(r: RoomCoord): void {
    const p = this.player, T = this.cfg.tile;
    // 重置点 = 进来的第一格的中心（离边缘半格）：人不到一格宽，整个在房间里；再往里就会落到第二格，那里可能是陷阱。
    // Boss 房封门时会自己把复活点改到封门处，不用在这里为它留余量
    const nx = Phaser.Math.Clamp(p.x, r.rx * this.roomPxW + T * 0.5, (r.rx + 1) * this.roomPxW - T * 0.5);
    const ny = Phaser.Math.Clamp(p.y, r.ry * this.roomPxH + T * 0.5, (r.ry + 1) * this.roomPxH - T * 0.5);
    this.prevEntry = this.entry;
    this.entry = { x: nx, y: ny, vx: p.body.velocity.x, vy: p.body.velocity.y };
    this.enterRoom(r, false);
    this.mechs.forEach(m => m.onRoomChanged?.(r));
  }

  // ---------- 重置 ----------
  /**
   * 重置前把"正在发生"的东西清掉：对话、镜头、火花，以及各机制的临时物体。
   * 整张图重置还清掉所有计时器和碎块平台；只重置一个房间时，别的房间里正在烧的引线、在掉的碎块、被驮着的纸照常进行
   * （地形和引线的计时器由它们自己的 resetRect 按房间取消，机制的计时器由机制在 onClear 里自己取消）
   */
  private clearTransient(scope: 'room' | 'world'): void {
    this.dialogue.end();
    this.mechs.forEach(m => m.onClear?.());
    if (scope === 'world') this.time.removeAllEvents();
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.shakeEffect.reset();
    this.sparks.killAll();
    if (scope === 'world') this.debris.clear();
    else this.debris.clearRoom(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
  }

  /** R：当前房间的地形、引线、怪物恢复，玩家回到入口。revive = 死了之后的复活 */
  /** @param appearDelayMs 人多久之后才由骷髅手放进来（这段时间藏着，等画面淡入） */
  private resetRoom(revive = false, appearDelayMs = 0): void {
    this.clearTransient('room');
    const x0 = this.room.rx * this.roomW, y0 = this.room.ry * this.roomH;
    this.terrain.resetRect(x0, y0, this.roomW, this.roomH);
    this.fuses.resetRect(x0, y0, this.roomW, this.roomH);
    this.enemies.resetRoom(this.room);
    this.mechs.forEach(m => m.onReset?.('room'));
    this.respawn('msg.roomReset', revive ? 'death' : 'reset', appearDelayMs);
  }

  /** 死亡重置整张地图：所有房间的地形、引线、怪物恢复，玩家回到重置点；探索记忆保留。机制可以改复活点（Boss 重演） */
  private resetWorld(revive = false): void {
    this.clearTransient('world');
    this.terrain.resetRect(0, 0, this.terrain.w, this.terrain.h);
    this.fuses.resetRect(0, 0, this.terrain.w, this.terrain.h);
    this.enemies.resetAll();
    let moved: EntryState | null = null;
    this.mechs.forEach(m => { const e = m.onReset?.('world'); if (e) moved = e; });
    if (moved) {
      this.entry = moved; this.prevEntry = null;
      const r = this.roomOf(this.entry.x, this.entry.y);
      if (!this.sameRoom(r, this.room)) this.enterRoom(r, true);
    }
    this.respawn('msg.mapReset', revive ? 'death' : 'reset');
  }

  /** 重置之后玩家回到复活点。delayMs > 0：人（连同帽子、手上的东西）先藏起来冻着，过这么久再出现 */
  private respawn(message: string, reason: AppearReason, delayMs = 0): void {
    this.dead = false;
    this.fogDirty = true;
    this.flash(message, '#9ad1ff');
    if (delayMs <= 0) { this.appear(reason); return; }
    this.respawning = true;   // 藏着的时候不响应按键、不会死、不换房间
    this.player.freeze(0xffffff); this.player.clearTint(); this.player.setVisible(false);
    this.time.delayedCall(delayMs, () => {
      this.respawning = false;
      this.player.setVisible(true);
      this.appear(reason);
    });
  }

  /**
   * 玩家出现在 this.entry（开局、换层、复活、R、进入下一关都走这里）。
   * config.respawnHandOn[reason] 开着就由骷髅手捏着放进来：放下之前人冻着、不响应输入、不会死；关着就直接出现。
   * then = 落地、能动了之后
   */
  private appear(reason: AppearReason, then?: () => void): void {
    const entry = this.entry;
    const land = () => { this.player.respawn(entry); this.lastResetAt = this.time.now; this.fogDirty = true; then?.(); };
    if (this.cfg.respawnHandMs <= 0 || !this.cfg.respawnHandOn[reason]) { land(); return; }
    this.respawning = true;
    const x0 = this.room.rx * this.roomPxW;
    playRespawnHand(this, this.player, entry, { tile: this.cfg.tile, durationMs: this.cfg.respawnHandMs, roomLeft: x0, roomRight: x0 + this.roomPxW }, () => {
      this.respawning = false;
      land();
    });
  }

  /** 死亡画面里按 R（或点一下）：按设置重置整张地图或当前房间 */
  private resetAfterDeath(): void {
    if (!this.dead || this.time.now - this.diedAt < 300) return;   // 刚死的一瞬间不响应，免得误触
    if (this.cfg.deathResetsWorld) this.resetWorld(true); else this.resetRoom(true);
    store.dispatch(setMode({ mode: 'playing' }));
  }

  // ---------- 第四面墙：整个画面被攥成纸团 ----------
  /** R 键重置房间：config.resetCrumple 开着就先放攥纸团特效，纸团扔掉后重置，新房间淡入完再把人放下来 */
  private requestRoomReset(): void {
    if (this.cfg.resetCrumple && this.crumpleWorld(fadeMs => this.resetRoom(false, fadeMs))) return;
    this.resetRoom();
  }

  /**
   * 放攥纸团特效（React 的 CrumpleOverlay）：游戏照常跑，骷髅手先伸进来；手碰到画面时特效发 EVT.crumpleFreeze，这里才冻住；
   * 纸团扔掉后特效发 EVT.crumpleDone，这里恢复并调 after(fadeMs)（fadeMs = 新画面淡入要多久）。
   * grab = 攥住的位置（画面的比例坐标）。没放成（状态不对、没有挂特效层）返回 false
   */
  crumpleWorld(after?: (fadeMs: number) => void, grab = { x: 0.5, y: 0.5 }): boolean {
    if (this.crumpling || this.dead || this.won || this.leaving || this.growing || this.respawning) return false;
    if (bridge.listenerCount(EVT.crumple) === 0) return false;
    this.crumpling = true;
    this.crumpleAfter = after ?? null;
    bridge.emit(EVT.crumple, { grab });
    return true;
  }

  /**
   * 冻住：场景暂停、声音停；等下一帧画完，把游戏画布原样复制一份交给特效。
   * 特效把它当成纸，摆在原位和冻住的画面一模一样，换上去看不出来
   */
  private freezeForCrumple(): void {
    if (this.crumpleFrozen) return;
    this.crumpling = true; this.crumpleFrozen = true;
    this.dialogue.end();
    this.sound.pauseAll();
    this.scene.pause();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      const src = this.game.canvas, image = document.createElement('canvas');
      image.width = src.width; image.height = src.height;
      image.getContext('2d')!.drawImage(src, 0, 0);   // 刚画完、还没交给浏览器合成，WebGL 画布这时读得到
      bridge.emit(EVT.crumpleFrozen, { image });
    });
  }

  private endCrumple(d: CrumpleDone): void {
    if (!this.crumpling) return;
    this.crumpling = false;
    if (this.crumpleFrozen) { this.crumpleFrozen = false; this.sound.resumeAll(); this.scene.resume(); }
    const after = this.crumpleAfter;
    this.crumpleAfter = null;
    after?.(d.fadeMs);
  }

  // ---------- 死亡 / 通关 / 换层 ----------
  private die(reason: string): void {
    if (this.dead || this.leaving || this.growing || this.respawning) return;   // 换层、进入下一关（淡出 + 长大）的过程中人是冻住的，不会死
    this.dead = true;
    this.dialogue.end();
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

  /** final=false 是"假通关"：按一下继续玩；final=true 是最后一层的真结束 */
  private win(final: boolean): void {
    if (this.won) return;
    this.won = true; this.wonFinal = final;
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const hat = (this.mechById.get('hat') as { wearing?: boolean } | undefined)?.wearing ?? false;
    store.dispatch(setMode({ mode: 'won', final, stage: this.player.stage, hat }));
    store.dispatch(setStats({ ...this.stats }));
  }

  private continueAfterWin(): void {
    if (!this.won || this.wonFinal) return;
    this.won = false;
    this.player.unfreeze();
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
  }

  /**
   * 假通关弹窗里点「进入下一关」：像换了一层，其实是画面淡出、整张地图复原（同死亡重置）、人回到本层出生点；
   * 淡入后站着不动，身体长高一阶（1 → 1.5 → 2 格，startGrowth），长完就能动，再玩一次。期间不响应输入
   */
  private fakeNextLevel(): void {
    if (!this.won || this.wonFinal || this.growing || this.leaving || this.dead || this.player.stage >= MAX_STAGE) return;
    this.won = false;
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    this.growing = true; this.growTween = null; this.growSince = null;
    const cam = this.cameras.main;
    cam.fadeOut(350, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.clearTransient('world');
      this.terrain.resetRect(0, 0, this.terrain.w, this.terrain.h);
      this.fuses.resetRect(0, 0, this.terrain.w, this.terrain.h);
      this.enemies.resetAll();
      this.mechs.forEach(m => m.onReset?.('level'));
      // 出生点是格子中心：身体已经比一格高了，按脚底贴着那一格的底边放，别陷进地板
      const spawn = this.spawnPoints[0] ?? this.entry, feet = spawn.y + this.cfg.tile / 2;
      this.entry = { x: spawn.x, y: feet - this.player.displayHeight / 2, vx: 0, vy: 0 }; this.prevEntry = null;
      const r = this.roomOf(spawn.x, spawn.y);
      if (!this.sameRoom(r, this.room)) this.enterRoom(r, true);
      this.mechs.forEach(m => m.onRoomChanged?.(this.room));   // 出生房间里有 Boss 之类的，重新开始
      this.fogDirty = true;
      // 放回出生点（骷髅手放下来，或者直接出现），落了地再冻住长大
      this.appear('level', () => { this.growSince = this.time.now; });
      cam.fadeIn(350, 0, 0, 0);
      this.flash(mapText(this.floor.name), '#ffd166');
    });
  }

  /** 长大动画：冻住，长高一阶（多 STAGE_EXTRA 格）；长完把复活点记在长大后的身体中心（脚底不变），解冻继续玩 */
  private startGrowth(): void {
    this.player.freeze(0xffffff); this.player.clearTint();
    const from = this.player.stage, to = Math.min(MAX_STAGE, from + 1);
    this.growTween = this.tweens.addCounter({
      from: from * STAGE_EXTRA, to: to * STAGE_EXTRA, delay: 500, duration: this.cfg.growMs, ease: 'Sine.easeInOut',
      onUpdate: tw => this.player.setGrowth(tw.getValue() ?? 0),
      onComplete: () => {
        this.player.setStage(to);
        this.growing = false; this.growTween = null;
        this.entry = { x: this.player.x, y: this.player.y, vx: 0, vy: 0 };
        this.player.unfreeze();
      },
    });
  }

  /** 换层。给了 via（门的位置）就先来一段旋涡：画面转着拉近门，人和东西都被吸进去 */
  private goToFloor(id: string, via?: Point): void {
    if (this.leaving) return;
    if (!this.project.floors.some(f => f.id === id)) { this.flash('msg.noFloor', '#ef476f'); return; }
    this.leaving = true;
    this.dialogue.end();
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const cam = this.cameras.main;
    const restart = () => {
      const carry: CarryOver = {};
      this.mechs.forEach(m => m.persist?.(carry));
      const data: StartGameData = { project: this.project, floorId: id, playtest: this.playtest, announceFloor: true, stats: { ...this.stats }, held: carry.held, hat: carry.hat, stage: this.player.stage, origin: this.origin };
      this.scene.restart(data);
    };
    const fade = (ms: number) => { cam.fadeOut(ms, 0, 0, 0); cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, restart); };
    if (!via) { fade(350); return; }
    vortex(this.ctx, via, this.mechs.flatMap(m => m.vortexTargets?.() ?? []), () => fade(250));
  }

  /** 这一局的起点（第一次进场的启动数据） */
  private get origin(): StartGameData { return this.startData.origin ?? this.startData; }

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

  /** 挂着的砖（尖刺）因为下面没了而碎掉：一点碎屑，迷雾重算 */
  private onCellsBroken(cells: CellRef[]): void {
    const T = this.cfg.tile;
    cells.forEach(c => this.sparks.explode(6, c.x * T + T / 2, c.y * T + T * 0.75));
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

