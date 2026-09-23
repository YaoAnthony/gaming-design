// ===== 游戏场景：房间制世界、起跳爆炸、怪物、危险格、存档 =====
import Phaser from 'phaser';
import type { CellRef, EnemySpawn, EntityHost, EntryState, FogState, GameConfig, Point, RoomCoord, SkillContext, SkillDef, WorldModel } from '@/type';
import { classify, Skills, Tiles } from '@/game/registry/registry';
import { Terrain, type Chunk } from '@/game/terrain/Terrain';
import { entityRows, fogRows, fuseRows, roomKeyAt, worldRows } from '@/game/world/WorldModel';
import { FuseNet } from '@/game/fuse/Fuse';
import { FogOfWar } from '@/game/fog/Fog';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { Player, Enemy, CarriedPaper, TopPlatform, Boss, SparkBurst, type JumpEvent } from '@/sprite';
import { createSparkEmitter, playCrush, playExplosion, playLand, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { touch, TOUCH_JUMP } from '@/game/input';
import { Music } from '@/game/Music';
import { flash, setBoss, setMode, setRoomKey, setStats } from '@/redux/slices/hudSlice';
import { writeSave } from '@/redux/slices/saveSlice';

export class GameScene extends Phaser.Scene implements EntityHost {
  private cfg!: GameConfig;
  private model!: WorldModel;
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
    this.model = data.model;
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
  }

  create(): void {
    this.cfg = store.getState().config;
    this.skill = Skills.get(this.cfg.skill) ?? Skills.list()[0];
    const T = this.cfg.tile;
    this.roomW = this.model.roomW; this.roomH = this.model.roomH;
    this.roomPxW = this.roomW * T; this.roomPxH = this.roomH * T;

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

    if (this.cfg.fogEnabled) {
      const noFog = new Set(Object.entries(this.model.roomFlags ?? {}).filter(([, f]) => f.noFog).map(([k]) => k));
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

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);
    if (this.roomFlagBoss(this.room)) this.startBoss(this.room);

    // 输入
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D' }) as Record<'A' | 'D', Phaser.Input.Keyboard.Key>;
    const press = () => this.player.pressJump(this.time.now);
    kb.on('keydown-SPACE', press); kb.on('keydown-UP', press); kb.on('keydown-W', press);
    bridge.on(TOUCH_JUMP, press);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { bridge.off(TOUCH_JUMP, press); touch.left = false; touch.right = false; });
    kb.on('keydown-R', () => { if (this.won) return; if (this.dead) this.resetAfterDeath(); else this.resetRoom(); });
    const requestReset = () => { if (this.dead && !this.won) this.resetAfterDeath(); };
    bridge.on(EVT.requestReset, requestReset);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bridge.off(EVT.requestReset, requestReset));
    if (this.playtest) kb.on('keydown-ESC', () => this.exitPlaytest());

    this.preview = this.add.graphics().setDepth(8);
    this.sparks = createSparkEmitter(this);

    this.music = new Music(this, this.cfg.musicVolume);
    this.music.play('bgm');
    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.music.stop(); store.dispatch(setMode({ mode: 'idle' })); store.dispatch(setBoss(null)); });
  }

  // ---------- EntityHost ----------
  addEnemy(spawn: EnemySpawn): void { this.enemySpawns.push(spawn); this.spawnEnemy(spawn); }
  addBoss(spawn: EnemySpawn): void { this.bossSpawns.push(spawn); }
  setGoal(p: Point): void {
    this.goal = p;
    this.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.cfg.tile / 2);
  }

  /** 在房间里找一个"脚下是实心、头顶两格是空气"的位置，离房间中心最近的那个；找不到就房间中央 */
  private standingSpot(r: RoomCoord): Point {
    const T = this.cfg.tile, x0 = r.rx * this.roomW, y0 = r.ry * this.roomH;
    const cx = x0 + this.roomW / 2, cy = y0 + this.roomH / 2;
    let best: CellRef | null = null, bestD = Infinity;
    for (let y = y0 + 1; y < y0 + this.roomH - 1; y++)
      for (let x = x0 + 1; x < x0 + this.roomW - 1; x++) {
        if (this.terrain.isSolid(x, y) || this.terrain.isSolid(x, y - 1) || !this.terrain.isSolid(x, y + 1)) continue;
        if (this.terrain.def(x, y).hazard) continue;
        const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
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
    if (this.bossRoom) this.time.delayedCall(350, () => { if (this.bossRoom && !this.boss && this.bossDoors.length) this.spawnBoss(this.bossRoom); });
  }

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
      this.bursts.push(new SparkBurst(this, this.boss.x, this.boss.y, this.cfg.bossBurstCount, this.cfg.bossBurstSpeed, this.cfg.tile, this.cfg.bossBurstTtl));
      this.cameras.main.shake(400, 0.015);
      this.flash('大史莱姆倒下了', '#ffd166');
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

  /** 碰到 Boss 即死 */
  private checkBossTouch(_boss: Boss, rect: Phaser.Geom.Rectangle): void {
    if (!this.dead && !this.won && Phaser.Geom.Intersects.RectangleToRectangle(rect, this.player.rect())) this.die('被大史莱姆吞了');
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
    store.dispatch(writeSave({ rows: this.terrain.rows(), room: this.room, entry: this.entry, stats: { jumps: this.jumps, destroyed: this.destroyed }, fog: this.fog?.toState(), fuse: this.fuses.toState() }));
  }

  private resetRoom(): void {
    this.clearCarried();
    if (this.boss || this.bossDoors.length || this.bossDoorsPending.length) this.endBoss(false);
    this.terrain.resetRect(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
    this.fuses.resetRect(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
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
    this.bossDefeated.clear();
    this.terrain.resetRect(0, 0, this.terrain.w, this.terrain.h);
    this.fuses.resetRect(0, 0, this.terrain.w, this.terrain.h);
    (this.enemies.getChildren() as Enemy[]).slice().forEach(e => e.destroy());
    this.enemySpawns.forEach(sp => this.spawnEnemy(sp));
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

  private clearCarried(): void {
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
    if (this.dead || this.won) { this.drawPreview(null); return; }

    const p = this.player;
    const r = this.roomOf(p.x, p.y);
    if (!this.sameRoom(r, this.room)) this.onRoomChanged(r);

    const input = { left: this.cursors.left.isDown || this.keys.A.isDown || touch.left, right: this.cursors.right.isDown || this.keys.D.isDown || touch.right };
    const jump = p.step(input, time);
    if (jump) { this.jumps += 1; this.useSkill(jump); store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed })); }

    this.drawPreview(p.previewJump(input) && this.aimJump(p.previewJump(input)!));
    this.handleChunkContact();
    if (this.dead) return;
    const hazard = this.touchingHazard();
    if (hazard) { this.die(hazard); return; }
    if (this.goal && Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 24) this.win();
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
    if (this.dead) return;
    this.dead = true;
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

  private win(): void {
    if (this.won) return;
    this.won = true;
    this.player.freeze(0xffffff);
    this.player.clearTint();
    store.dispatch(setMode({ mode: 'won' }));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
  }
}
