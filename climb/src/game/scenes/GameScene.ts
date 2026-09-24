// ===== 游戏场景：只做编排 =====
// 核心：地形、碎块、怪物、引线、迷雾、房间与镜头、死亡 / 重置 / 通关、存档、按键。
// 玩法都在 game/mechanics/ 里：一个层机制（这一层怎么动）+ 若干通用机制（Boss、钥匙、角色……），
// 这里按生命周期调用它们的钩子，不认识具体机制。
import Phaser from 'phaser';
import type { CellRef, CoreHost, EnemySpawn, EntryState, Floor, GameConfig, Point, Project, RoomCoord, SaveData, WorldModel } from '@/type';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { entityRows, fogRows, fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { Player } from '@/sprite';
import { createSparkEmitter, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { resizeGame } from '@/game/resize';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/game/input';
import { Music } from '@/game/Music';
import { flash, setBoss, setControls, setDialogue, setMode, setPlace, setRoomKey, setScore, setStats } from '@/redux/slices/hudSlice';
import { writeSave } from '@/redux/slices/saveSlice';
import { floorMechanicOf, globalMechanicsOf, type FloorMechanic, type Mechanic, type MechanicDef, type MoveInput } from '@/game/mechanics/define';
import type { PlayContext } from '@/game/core/PlayContext';
import { Dialogue } from '@/game/core/Dialogue';
import { Enemies } from '@/game/core/Enemies';
import { Debris } from '@/game/core/Debris';
import { standingSpot, touchingHazard } from '@/game/core/rooms';
import { buildBackground } from '@/game/core/backdrop';
import { vortex } from '@/game/core/vortex';

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
  /** 正在切层（淡出中），不再响应输入 */
  private leaving = false;
  private stats = { jumps: 0, destroyed: 0 };

  constructor() { super(SCENE.game); }

  init(data: StartGameData): void {
    this.startData = data;
    this.project = data.project;
    this.floor = (data.floorId && this.project.floors.find(f => f.id === data.floorId)) || this.project.floors[0];
    this.mechs = []; this.mechById = new Map();
    this.fog = null; this.fogTile = { x: -1, y: -1 }; this.fogDirty = true;
    this.spawnPoints = [];
    this.stats = { jumps: data.stats?.jumps ?? 0, destroyed: data.stats?.destroyed ?? 0 };
    this.dead = false; this.won = false; this.wonFinal = false; this.leaving = false;
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

    // ---- 地形：读档时用存档里的格子状态，但"原始状态"仍是地图本身（R 重置用） ----
    const rows = worldRows(model);
    this.terrain = new Terrain({
      scene: this,
      onChunkFall: ch => this.debris.onChunkFall(ch),
      onChunkLand: ch => this.debris.onChunkLand(ch),
      catchChunk: ch => this.debris.catchChunk(ch),
    }, rows, { tile: T, explosionRadius: this.cfg.explosionRadius, chunkGravity: this.cfg.chunkGravity, chunkMaxFall: this.cfg.chunkMaxFall });
    const saved = this.startData.rows;
    if (saved && saved.length === rows.length) {
      saved.forEach((r, y) => [...r].forEach((c, x) => { if (this.terrain.grid[y][x] !== c && (c === '.' || this.terrain.def(0, 0) !== undefined)) this.terrain.set(x, y, c); }));
    }
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    buildBackground(this, levelW, levelH);
    this.fuses = new FuseNet(this, fuseRows(model), { tile: T, delayMs: this.cfg.fuseDelayMs }, this.startData.fuse ?? undefined);

    // 迷雾按房间开启：只要有一个房间开了就建迷雾层，其余房间全亮
    const fogRooms = new Set(Object.entries(model.roomFlags ?? {}).filter(([, f]) => f.fog).map(([k]) => k));
    if (fogRooms.size) {
      const noFog = new Set(Object.keys(model.rooms).filter(k => !fogRooms.has(k)));
      this.fog = new FogOfWar(this, this.terrain.grid, fogRows(model).map(r => r.split('')), {
        tile: T, roomW: this.roomW, roomH: this.roomH, radius: this.cfg.fogRadius, memoryAlpha: this.cfg.fogMemoryAlpha,
        keyAt: (rx, ry) => roomKeyAt(model, rx, ry), noFogRooms: noFog,
      }, this.startData.fog ?? undefined);
    }

    this.sparks = createSparkEmitter(this);
    this.music = new Music(this, this.cfg.musicVolume);
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
    if (!start && startRoom) start = this.spawnPoints.find(p => this.sameRoom(this.roomOf(p.x, p.y), startRoom)) ?? standingSpot(this.terrain, startRoom, this.roomW, this.roomH);
    start ??= this.spawnPoints[0] ?? { x: 2 * T, y: 4 * T };
    this.player = new Player(this, start.x, start.y, this.cfg);
    if (this.startData.entry) this.player.setVelocity(this.startData.entry.vx, this.startData.entry.vy);
    this.physics.world.gravity.y = this.floorMech.gravity ?? this.cfg.gravity;
    if (this.floorMech.collideTerrain) this.physics.add.collider(this.player, this.terrain.layer);
    this.physics.add.collider(this.player, this.debris.platforms);

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);

    // ---- HUD（机制 start 里可能会改，比如吃豆人显示分数） ----
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setPlace(this.floor.place ?? ''));
    store.dispatch(setControls(defs[0].controls)); store.dispatch(setScore(null));
    store.dispatch(setStats(this.stats));

    this.mechs.forEach(m => m.start?.());
    this.mechs.forEach(m => m.onRoomChanged?.(this.room));

    this.bindInput();

    this.music.play('bgm');
    let lastVol = this.cfg.musicVolume;
    const unsubVol = store.subscribe(() => { const v = store.getState().config.musicVolume; if (v !== lastVol) { lastVol = v; this.music.setVolume(v); } });
    if (this.startData.announceFloor) {
      this.cameras.main.fadeIn(350, 0, 0, 0);
      this.flash(this.floor.name, '#ffd166');
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
      standingSpot: r => standingSpot(this.terrain, r, this.roomW, this.roomH),
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
      get playtest() { return s.playtest; },
      get entry() { return s.entry; },
      set entry(e) { s.entry = e; },
      stats: this.stats,
      pushStats: () => store.dispatch(setStats({ ...this.stats })),
      die: reason => this.die(reason),
      win: final => this.win(final),
      goToFloor: (id, via) => this.goToFloor(id, via),
      autosave: () => this.autosave(),
      igniteFuses: ends => this.fuses.ignite(ends, this.terrain, cells => this.onFuseBurn(cells)),
      fx: {
        flash: (text, color) => this.flash(text, color),
        popScore: (x, y, n) => this.popScore(x, y, n),
        fogDirty: () => { this.fogDirty = true; },
      },
      hud: {
        score: n => store.dispatch(setScore(n)),
        boss: v => store.dispatch(setBoss(v)),
      },
      mech: <T extends Mechanic>(id: string) => this.mechById.get(id) as T | undefined,
      blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= this.terrain.w || cy >= this.terrain.h || this.terrain.isSolid(cx, cy) || this.blockedByMechanics(cx, cy),
      blockedByMechanics: (cx, cy) => this.blockedByMechanics(cx, cy),
    };
  }

  private blockedByMechanics(cx: number, cy: number): boolean { return this.mechs.some(m => m.blocks?.(cx, cy)); }

  // ---------- 按键 ----------
  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D', W: 'W', S: 'S' }) as GameScene['keys'];
    const press = (key: PressKey) => { if (this.won) this.continueAfterWin(); else this.floorMech.onPress(key, this.time.now); };
    const touchPress = () => press('touch');
    kb.on('keydown-SPACE', () => press('SPACE'));
    kb.on('keydown-UP', () => press('UP'));
    kb.on('keydown-W', () => press('W'));
    bridge.on(TOUCH_JUMP, touchPress); bridge.on(TOUCH_ACTION, touchPress);
    kb.on('keydown-R', () => { if (this.won) return; if (this.dead) this.resetAfterDeath(); else this.resetRoom(); });
    const requestReset = () => { if (this.dead && !this.won) this.resetAfterDeath(); };
    const continueGame = () => { if (this.won) this.continueAfterWin(); };
    bridge.on(EVT.requestReset, requestReset); bridge.on(EVT.continueGame, continueGame);
    if (this.playtest) kb.on('keydown-ESC', () => this.exitPlaytest());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bridge.off(TOUCH_JUMP, touchPress); bridge.off(TOUCH_ACTION, touchPress);
      bridge.off(EVT.requestReset, requestReset); bridge.off(EVT.continueGame, continueGame);
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
    if (this.dead || this.won || this.leaving) return;

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
    const T = this.cfg.tile, b = this.player.body;
    const tx = Math.floor(b.center.x / T), ty = Math.floor(b.center.y / T);
    if (tx !== this.fogTile.x || ty !== this.fogTile.y || this.fogDirty) {
      this.fogTile = { x: tx, y: ty }; this.fogDirty = false;
      this.fog.compute(tx, ty);
    }
    this.fog.draw();
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
    store.dispatch(setRoomKey(roomKeyAt(this.model, r.rx, r.ry) ?? '?'));
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
    this.autosave();
    this.mechs.forEach(m => m.onRoomChanged?.(r));
  }

  private autosave(): void {
    if (this.playtest) return;
    const out: Partial<SaveData> = {};
    this.mechs.forEach(m => m.persist?.(out, 'save'));
    store.dispatch(writeSave({ ...out, floorId: this.floor.id, rows: this.terrain.rows(), room: this.room, entry: this.entry, stats: { ...this.stats }, fog: this.fog?.toState(), fuse: this.fuses.toState() }));
  }

  // ---------- 重置 ----------
  /** 重置前把所有"正在发生"的东西清掉：对话、定时器、镜头、火花、碎块平台，以及各机制的临时物体 */
  private clearTransient(): void {
    this.dialogue.end();
    this.mechs.forEach(m => m.onClear?.());
    this.time.removeAllEvents();
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.shakeEffect.reset();
    this.sparks.killAll();
    this.debris.clear();
  }

  /** R：当前房间的地形、引线、怪物恢复，玩家回到入口 */
  private resetRoom(): void {
    this.clearTransient();
    const x0 = this.room.rx * this.roomW, y0 = this.room.ry * this.roomH;
    this.terrain.resetRect(x0, y0, this.roomW, this.roomH);
    this.fuses.resetRect(x0, y0, this.roomW, this.roomH);
    this.enemies.resetRoom(this.room);
    this.mechs.forEach(m => m.onReset?.('room'));
    this.respawn('房间已重置');
  }

  /** 死亡重置整张地图：所有房间的地形、引线、怪物恢复，玩家回到重置点；探索记忆保留。机制可以改复活点（Boss 重演） */
  private resetWorld(): void {
    this.clearTransient();
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
    this.respawn('地图已重置');
  }

  private respawn(message: string): void {
    this.player.respawn(this.entry);
    this.dead = false;
    this.fogDirty = true;
    this.lastResetAt = this.time.now;
    this.flash(message, '#9ad1ff');
  }

  /** 死亡画面里按 R（或点一下）：按设置重置整张地图或当前房间 */
  private resetAfterDeath(): void {
    if (!this.dead || this.time.now - this.diedAt < 300) return;   // 刚死的一瞬间不响应，免得误触
    if (this.cfg.deathResetsWorld) this.resetWorld(); else this.resetRoom();
    store.dispatch(setMode({ mode: 'playing' }));
  }

  // ---------- 死亡 / 通关 / 换层 ----------
  private die(reason: string): void {
    if (this.dead || this.leaving) return;
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
    store.dispatch(setMode({ mode: 'won', final }));
    store.dispatch(setStats({ ...this.stats }));
  }

  private continueAfterWin(): void {
    if (!this.won || this.wonFinal) return;
    this.won = false;
    this.player.unfreeze();
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
  }

  /** 换层。给了 via（门的位置）就先来一段旋涡：画面转着拉近门，人和东西都被吸进去 */
  private goToFloor(id: string, via?: Point): void {
    if (this.leaving) return;
    if (!this.project.floors.some(f => f.id === id)) { this.flash('没有这一层', '#ef476f'); return; }
    this.leaving = true;
    this.dialogue.end();
    this.player.freeze(0xffffff);
    this.player.clearTint();
    const cam = this.cameras.main;
    const restart = () => {
      const carry: Partial<SaveData> = {};
      this.mechs.forEach(m => m.persist?.(carry, 'floor'));
      const data: StartGameData = { project: this.project, floorId: id, playtest: this.playtest, announceFloor: true, stats: { ...this.stats }, held: carry.held };
      this.scene.restart(data);
    };
    const fade = (ms: number) => { cam.fadeOut(ms, 0, 0, 0); cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, restart); };
    if (!via) { fade(350); return; }
    vortex(this.ctx, via, this.mechs.flatMap(m => m.vortexTargets?.() ?? []), () => fade(250));
  }

  private exitPlaytest(): void {
    bridge.emit(EVT.playtestExit);
    this.scene.start(SCENE.editor);
  }

  // ---------- 引线 / 效果 ----------
  /** 引线每烧一跳：火花 + 迷雾要重算 + 通知机制（Boss 被烧到会扣血） */
  private onFuseBurn(cells: CellRef[]): void {
    this.fogDirty = true;
    const T = this.cfg.tile;
    cells.forEach(c => this.sparks.explode(5, c.x * T + T / 2, c.y * T + T / 2));
    this.mechs.forEach(m => m.onFuseBurn?.(cells));
    store.dispatch(setStats({ ...this.stats }));
  }

  private flash(text: string, color: string): void { store.dispatch(flash({ text, color })); }

  /** 飘起来的分数 */
  private popScore(x: number, y: number, n: number): void {
    const t = this.add.text(x, y, String(n), { fontSize: '14px', color: '#4cf0f0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 900, ease: 'Sine.out', onComplete: () => t.destroy() });
  }
}

