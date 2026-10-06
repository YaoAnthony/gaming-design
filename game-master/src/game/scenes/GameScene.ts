// ===== 游戏场景：只做编排 =====
// 核心部件各管一摊（game/core/）：地形、碎块、怪物、引线、迷雾、房间与镜头（Rooms）、死亡与重置（Respawn）、
// 长大仪式（Growth）、攥纸团（CrumpleFx）、按键（GameInput）。玩法都在 game/mechanics/ 里：一个层机制（这一层怎么动）
// + 若干通用机制（Boss、钥匙、角色……），这里按生命周期调用它们的钩子，不认识具体机制。
import Phaser from 'phaser';
import type { CarryOver, CellRef, CoreHost, EnemySpawn, Floor, GameConfig, Point, Project, WorldModel } from '@/type';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { entityRows, floorAfter, fogRows, fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, type StartGameData, type RhythmTest } from '@/protocol';
import { SCENE } from '@/game/scenes/keys';
import { Player } from '@/sprite';
import { createSparkEmitter, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { Music } from '@/game/Music';
import { DEFAULT_MUSIC, NO_MUSIC } from '@/asset';
import { flash, setBoss, setBossIntro, setControls, setHearts, setDialogue, setMode, setPlace, setRhythm, setRhythmMode, setScore, setStats, whiteout } from '@/redux/slices/hudSlice';
import { setConfig } from '@/redux/slices/configSlice';
import { checkpoint, clearRun } from '@/redux/slices/runSlice';
import { mapText, tr } from '@/i18n';
import { floorMechanicOf, globalMechanicsOf, type FloorMechanic, type FuseBurnCell, type Mechanic, type MechanicDef } from '@/game/mechanics/define';
import type { PlayContext } from '@/game/core/PlayContext';
import { Dialogue } from '@/game/core/Dialogue';
import { Enemies } from '@/game/core/Enemies';
import { Debris } from '@/game/core/Debris';
import { shiftUnder } from '@/game/core/solid';
import { Solids } from '@/game/core/solids';
import { Rooms } from '@/game/core/Rooms';
import { Respawn } from '@/game/core/Respawn';
import { Growth } from '@/game/core/Growth';
import { Health } from '@/game/core/Health';
import { PopOut } from '@/game/core/PopOut';
import { RhythmFight } from '@/game/rhythm/RhythmFight';
import { chartById, chartOfArena } from '@/rhythm';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import type { DeathKey } from '@/i18n/keys';
import { CrumpleFx } from '@/game/core/CrumpleFx';
import { GameInput } from '@/game/core/GameInput';
import { standingSpot, touchingHazard } from '@/game/core/roomSpots';
import { Backdrop } from '@/game/background/Backdrop';
import { applySceneFx, type SceneFx } from '@/game/core/sceneFx';
import { vortex } from '@/game/core/vortex';
import { Colors, hex } from '@/game/palette';

/** 节奏关卡：破屏那一刻画面闪多久（毫秒） */
const BREAK_FLASH_MS = 220;
/** 骷髅王（i18n key）；节奏关卡开场白里跳不过去的那两句各显示多久（毫秒）：越说越大的「来吧」、带大字的最后一句（大字晚一秒才砸下来） */
const KING = 'npc.skeletonKing', INTRO_AUTO = { grow: 2600, shout: 3200 };

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
  private sparks!: SparkEmitter;
  private music!: Music;
  private dialogue!: Dialogue;
  private rooms!: Rooms;
  private respawn!: Respawn;
  private health!: Health;
  private growth!: Growth;
  private crumple!: CrumpleFx;
  private popOut!: PopOut;
  private rhythm!: RhythmFight;
  private backdrop!: Backdrop;
  private controls!: GameInput;

  private spawnPoints: Point[] = [];
  private won = false;
  /** 通关画面是不是真的结束（否则按一下继续玩） */
  private wonFinal = false;
  /** 正在切层（淡出中），不再响应输入 */
  private leaving = false;
  private stats = { jumps: 0, destroyed: 0 };

  constructor() { super(SCENE.game); }

  init(data: StartGameData): void {
    this.startData = data;
    this.project = data.project;
    this.floor = (data.floorId && this.project.floors.find(f => f.id === data.floorId)) || this.project.floors[0];
    this.mechs = []; this.mechById = new Map();
    this.fog = null; this.fogTile = { x: -1, y: -1 }; this.fogDirty = true; this.fogCarried = false;
    this.spawnPoints = [];
    this.stats = { jumps: data.stats?.jumps ?? 0, destroyed: data.stats?.destroyed ?? 0 };
    this.won = false; this.wonFinal = false; this.leaving = false;
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
    }] : [])));
    this.sceneFx = applySceneFx(this, this.cfg.sceneFx, fxRooms, T);
    this.fuses = new FuseNet(this, fuseRows(model), { tile: T, delayMs: this.cfg.fuseDelayMs, light: (x, y) => this.sceneFx.light(x, y, 'ember') });

    // 迷雾层：有全屋暗的房间（roomFlags.fog），或者画了迷雾区，才建；普通房间里只有迷雾区是黑的
    const darkRooms = new Set(Object.entries(model.roomFlags ?? {}).filter(([, f]) => f.fog).map(([k]) => k));
    const zones = fogRows(model);
    if (darkRooms.size || zones.some(r => /[^.]/.test(r))) {
      this.fog = new FogOfWar(this, this.terrain.grid, zones.map(r => r.split('')), {
        tile: T, roomW: model.roomW, roomH: model.roomH, radius: this.cfg.fogRadius, memoryAlpha: this.cfg.fogMemoryAlpha, unseenAlpha: this.cfg.fogUnseenAlpha,
        keyAt: (rx, ry) => roomKeyAt(model, rx, ry), darkRooms,
      });
    }

    this.sparks = createSparkEmitter(this);
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
    });
    this.growth = new Growth({
      scene: this, cfg: this.cfg, rooms: this.rooms, respawn: this.respawn, terrain: this.terrain, fuses: this.fuses,
      player: () => this.player, enemies: () => this.enemies, mechs: () => this.mechs, spawnPoint: () => this.spawnPoints[0] ?? null,
      announce: () => this.flash(mapText(this.floor.name), hex(Colors.gold)),
      fogDirty: () => { this.fogDirty = true; },
    });
    this.crumple = new CrumpleFx(this, () => this.dialogue.end());
    this.popOut = new PopOut({ scene: this, player: () => this.player, tile: T, canLeave: () => !this.busy && !this.crumple.active, blocked: (cx, cy) => this.ctx.blocked(cx, cy), hazard: (cx, cy) => !!this.terrain.def(cx, cy).hazard });
    // 节奏关卡：骷髅王弹琴时这一层的音乐让位给那首曲子，打完音乐回来
    this.rhythm = new RhythmFight({
      scene: this, cfg: this.cfg, player: () => this.player, held: () => this.controls.read(),
      standAt: () => this.respawn.entry,
      groundBelow: (x, y) => {   // 从这一格往下找到第一格实心的，地面就是它的顶
        const cx = Math.floor(x / T);
        let cy = Math.floor(y / T);
        while (cy < this.terrain.h && !this.terrain.isSolid(cx, cy)) cy++;
        return cy * T;
      },
      canStart: () => !this.busy && !this.crumple.active && this.player.body.blocked.down,
      away: () => this.popOut.away, popOut: from => this.popOut.request(from),
      // 开场白：前三句跳一下翻一句；从「来吧」开始跳不过去了，自己往下走（一声比一声大，最后砸下一行大字）
      talk: (locked, done) => this.dialogue.talk({ name: KING, avatar: 'default', lines: [0, 1, 2].map(i => ({ text: `dialogue.festival.${i}`, pos: 'top' as const })) }, () => {
        locked();
        this.dialogue.cutscene(KING, [
          { text: 'dialogue.festival.3', grow: true, autoMs: INTRO_AUTO.grow, pos: 'top' },
          { text: 'dialogue.festival.4', shout: 'dialogue.festivalShout', autoMs: INTRO_AUTO.shout, pos: 'top' },
        ], this.time.now, done);
      }),
      say: (line, ms, done) => this.dialogue.cutscene(KING, [{ text: line, autoMs: ms, pos: 'top' }], this.time.now, done),
      onBegin: () => this.music.play(NO_MUSIC), onEnd: () => this.music.playBase(),
      onMode: mode => { store.dispatch(setRhythmMode(mode)); },
      taunt: mode => tr(`rhythm.taunt.${mode}`),
      onScore: v => {
        store.dispatch(setScore(v ? v.points : null));
        if (!v || v.judge || v.fresh) store.dispatch(setRhythm(v && { combo: v.combo, judge: v.judge }));   // 自动判的只动分数，不把上一次的判定字冲掉
      },
      onBoss: v => store.dispatch(setBoss(v)),
      onHp: v => { if (v) store.dispatch(setHearts({ ...v, tiered: true })); else this.health.reset(); },   // 打完换回平时的心
      onBreak: () => { store.dispatch(whiteout()); this.cameras.main.flash(BREAK_FLASH_MS); },
      onResult: (won, percent, test) => {
        this.flash(won ? 'rhythm.won' : 'rhythm.lost', hex(won ? Colors.mint : Colors.rose), { percent });
        if (won && !test && chartOfArena(this.floor.id)) this.win(true);   // 在庆典大厅打赢了：通关（试玩不算）
      },
    });
    this.solids = new Solids(this, () => ({ player: this.player, enemies: this.enemies.group }));
    this.ctx = this.buildContext();
    this.enemies = new Enemies(this.ctx);
    this.debris = new Debris(this.ctx);

    // ---- 机制实例 ----
    defs.forEach(d => { const m = d.create(this.ctx, baked.get(d.id)); this.mechs.push(m); this.mechById.set(d.id, m); });
    this.floorMech = this.mechs[0] as FloorMechanic;
    this.health = new Health({
      scene: this, cfg: this.cfg, player: () => this.player, enabled: defs[0].id === 'platform',
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

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.respawn.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.rooms.enter(this.rooms.of(start.x, start.y), true);

    // ---- HUD（机制 start 里可能会改，比如吃豆人显示分数） ----
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setPlace(mapText(this.floor.place ?? '')));
    store.dispatch(setControls(defs[0].controls)); store.dispatch(setScore(null));
    store.dispatch(setStats(this.stats));

    this.mechs.forEach(m => m.start?.());
    this.mechs.forEach(m => m.onRoomChanged?.(this.rooms.current));

    this.controls = new GameInput(this, {
      press: key => { if (this.respawn.respawning || this.popOut.away || this.rhythm.active) return; if (this.won) this.continueAfterWin(); else this.floorMech.onPress(key, this.time.now); },
      // 换层（旋涡、淡出）和长大的过程中不响应 R：重置会清掉它们正在等的计时器和镜头，画面就卡在半路
      reset: () => { if (this.won || this.leaving || this.growth.growing || this.respawn.respawning || this.crumple.active || this.rhythm.active) return; if (this.respawn.dead) this.respawn.resetAfterDeath(); else this.requestRoomReset(); },
      continueGame: () => { if (this.won) this.continueAfterWin(); },
      restartRun: () => this.restartRun(),
      nextLevel: () => this.fakeNextLevel(),
      exitPlaytest: () => { if (this.playtest) this.exitPlaytest(); },
      crumpleFreeze: () => this.crumple.freeze(),
      crumpleDone: d => this.crumple.end(d),
      popOut: () => this.popOut.request(),
      heroEntry: q => this.popOut.answerEntry(q),
      heroReturn: at => this.popOut.comeBack(at),
      rhythmStart: r => this.startRhythm(r.chartId, r.test),
      rhythmStop: () => this.rhythm.stop(),
    }, this.playtest);
    // 玩家出场：换层带着 origin（这一局早就开始了），没有就是这一局的第一次出现
    this.respawn.appear(this.startData.origin ? 'floor' : 'start');
    this.saveCheckpoint();
    // 这一层是哪张谱的场地（庆典大厅）：骷髅王已经在等了，人一落地就开打
    const festival = chartOfArena(this.floor.id);
    if (festival) this.rhythm.stage(festival.id, !this.startData.rhythmLab);   // 技术验证编辑器里的试玩：摆好场子等着，不自动开打
    // 存档里人在 3D 世界：出场之后接着跳出去
    if (!this.playtest && store.getState().run.realm === 'deep') this.popOut.request();

    this.music.playBase();
    let lastVol = this.cfg.musicVolume;
    const unsubVol = store.subscribe(() => { const v = store.getState().config.musicVolume; if (v !== lastVol) { lastVol = v; this.music.setVolume(v); } });
    if (this.startData.announceFloor) {
      this.cameras.main.fadeIn(350, 0, 0, 0);
      this.flash(mapText(this.floor.name), hex(Colors.gold));
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mechs.forEach(m => m.destroy?.());
      this.rhythm.destroy();
      // 迷雾和地形体积感的画布是全局贴图（场景关了还在）：换层 / 重开时不放掉，内存只增不减
      this.fog?.destroy(); this.fog = null;
      this.terrain.destroy();
      unsubVol();
      this.music.stop();
      store.dispatch(setMode({ mode: 'idle' })); store.dispatch(setBoss(null)); store.dispatch(setBossIntro(null)); store.dispatch(setHearts(null)); store.dispatch(setDialogue(null));
    });
  }

  private get playtest(): boolean { return !!this.startData.playtest; }
  /** 人被别的事占着：死了、通关画面、换层、长大仪式、出场动画、跳出画面去了 3D 世界 */
  private get busy(): boolean { return this.respawn.dead || this.won || this.leaving || this.growth.growing || this.respawn.respawning || this.popOut.away; }
  /** 人不归玩家管的时候：被别的事占着，或者在打节奏关卡（按键归节奏玩法） */
  private get frozen(): boolean { return this.busy || this.rhythm.active; }
  /** 人不在画面里的时候死不了（落石砸不到 3D 世界里的人） */
  private die(reason: DeathKey): void { if (!this.popOut.away) this.respawn.die(reason); }

  // ---------- 给机制用的上下文 ----------
  private buildContext(): PlayContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 上下文里的 getter 要读场景的当前值
    const s = this;
    return {
      scene: this, cfg: this.cfg, project: this.project, floor: this.floor, model: this.model, start: this.startData,
      terrain: this.terrain, fuses: this.fuses, fog: this.fog, sparks: this.sparks, music: this.music, dialogue: this.dialogue, rooms: this.rooms,
      get player() { return s.player; },
      get enemies() { return s.enemies; },
      get debris() { return s.debris; },
      get dead() { return s.respawn.dead; },
      get won() { return s.won; },
      get leaving() { return s.leaving; },
      get appearing() { return s.respawn.respawning; },
      get playtest() { return s.playtest; },
      get entry() { return s.respawn.entry; },
      set entry(e) { s.respawn.entry = e; },
      stats: this.stats,
      pushStats: () => store.dispatch(setStats({ ...this.stats })),
      die: reason => this.die(reason),
      hurt: (reason, from) => this.health.hurt(reason, from),
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
        bossIntro: v => store.dispatch(setBossIntro(v)),
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
    };
  }

  private blockedByMechanics(cx: number, cy: number): boolean { return this.mechs.some(m => m.blocks?.(cx, cy)); }

  // ---------- 每帧 ----------
  update(time: number, delta: number): void {
    const dt = delta / 1000;
    this.terrain.updateChunks(dt);
    this.enemies.update();
    this.debris.update();
    this.dialogue.update(time);
    this.mechs.forEach(m => m.update?.(time, dt));
    this.updateFog();
    this.growth.update(time);   // 回到出生点、落了地再开始长
    this.popOut.update();
    this.backdrop.update(this.player.x, this.player.y);
    this.rhythm.update();
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
    const hat = (this.mechById.get('hat') as { wearing?: boolean } | undefined)?.wearing ?? false;
    store.dispatch(setMode({ mode: 'won', final, stage: this.player.stage, hat }));
    store.dispatch(setStats({ ...this.stats }));
    if (final && !this.playtest) store.dispatch(clearRun());   // 真通关：这一局结束，下次从头开始
  }

  /** 存档的检查点（进层、换房间）：在哪层哪个房间、身上带着什么。试玩不存 */
  private saveCheckpoint(): void {
    if (this.playtest) return;
    const carry: CarryOver = {};
    this.mechs.forEach(m => m.persist?.(carry));
    const { rx, ry } = this.rooms.current;
    store.dispatch(checkpoint({ floorId: this.floor.id, room: { rx, ry }, stage: this.player.stage, hat: !!carry.hat, held: carry.held ?? null, stats: { ...this.stats } }));
  }

  private continueAfterWin(): void {
    if (!this.won || this.wonFinal) return;
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
    if (!this.project.floors.some(f => f.id === id)) { this.flash('msg.noFloor', hex(Colors.rose)); return; }
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

  /** 开一场节奏关卡：这张谱有自己的场地、人又不在那一层，就先传过去（到了那边自己开打）；否则就地开 */
  private startRhythm(chartId: string, test?: RhythmTest): void {
    const arena = chartById(chartId)?.arena;
    if (!arena || arena === this.floor.id) { this.rhythm.start(chartId, test); return; }
    if (this.frozen || this.crumple.active) return;
    // 这份地图里没有那一层（编辑器里的地图是旧的）：从打包的默认地图里借过来
    const floor = this.project.floors.find(f => f.id === arena) ?? DEFAULT_PROJECT.floors.find(f => f.id === arena);
    if (!floor) return;
    if (!this.project.floors.includes(floor)) this.project = { ...this.project, floors: [...this.project.floors, floor] };
    this.goToFloor(arena);
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
