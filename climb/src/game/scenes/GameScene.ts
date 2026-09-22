// ===== 游戏场景：房间制世界、起跳爆炸、怪物、危险格、存档 =====
import Phaser from 'phaser';
import type { CellRef, EnemySpawn, EntityHost, EntryState, GameConfig, Point, RoomCoord, WorldModel } from '@/type';
import { classify } from '@/game/registry/registry';
import { Terrain } from '@/game/terrain/Terrain';
import { roomKeyAt, roomName, worldRows } from '@/game/world/WorldModel';
import { bridge, EVT, SCENE, type StartGameData } from '@/game/bridge';
import { Player, Enemy } from '@/sprite';
import { createSparkEmitter, playCrush, playExplosion, playLand, type SparkEmitter } from '@/particle';
import { store } from '@/redux/store';
import { flash, setMode, setRoomInfo, setStats } from '@/redux/slices/hudSlice';
import { writeSave } from '@/redux/slices/saveSlice';

export class GameScene extends Phaser.Scene implements EntityHost {
  private cfg!: GameConfig;
  private model!: WorldModel;
  private playtest = false;
  private startRoom: RoomCoord | null = null;
  private savedRows: string[] | null = null;
  private savedEntry: EntryState | null = null;

  private terrain!: Terrain;
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private sparks!: SparkEmitter;
  private preview!: Phaser.GameObjects.Graphics;
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
    this.jumps = data.stats?.jumps ?? 0;
    this.destroyed = data.stats?.destroyed ?? 0;
    this.dead = false; this.won = false; this.prevEntry = null; this.lastResetAt = null;
    this.spawnPoints = []; this.enemySpawns = []; this.goal = null;
  }

  create(): void {
    this.cfg = store.getState().config;
    const T = this.cfg.tile;
    this.roomW = this.model.roomW; this.roomH = this.model.roomH;
    this.roomPxW = this.roomW * T; this.roomPxH = this.roomH * T;

    const rows = worldRows(this.model);
    // 读档时用存档里的格子状态，但"原始状态"仍是地图本身（R 重置用）
    this.terrain = new Terrain({ scene: this, onChunkFall: () => this.flash('地形断裂！', '#ffd166'), onChunkLand: cells => this.onChunkLand(cells) },
      rows, { tile: T, explosionRadius: this.cfg.explosionRadius, chunkGravity: this.cfg.chunkGravity, chunkMaxFall: this.cfg.chunkMaxFall });
    if (this.savedRows && this.savedRows.length === rows.length) {
      this.savedRows.forEach((r, y) => [...r].forEach((c, x) => { if (this.terrain.grid[y][x] !== c && (c === '.' || this.terrain.def(0, 0) !== undefined)) this.terrain.set(x, y, c); }));
    }
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    this.physics.world.gravity.y = this.cfg.gravity;

    this.buildBackground(levelW, levelH);

    // 怪物组先建好，物件 spawn 时会用到
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false });
    this.physics.add.collider(this.enemies, this.terrain.layer);

    // 物件：每个字符问注册表，由物件自己决定怎么进场
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      const cls = classify(c);
      if (cls.kind !== 'entity') return;
      cls.def.spawn({ host: this, wx: x * T + T / 2, wy: y * T + T / 2, cell: { x, y, rx: Math.floor(x / this.roomW), ry: Math.floor(y / this.roomH) } });
    }));

    // 出生点：读档入口 > 试玩起始房间里的 > 全图第一个 > 起始房间中央
    let start: Point | null = this.savedEntry;
    if (!start && this.startRoom) start = this.spawnPoints.find(p => this.sameRoom(this.roomOf(p.x, p.y), this.startRoom!)) ?? null;
    if (!start) start = this.spawnPoints[0] ?? null;
    if (!start && this.startRoom) start = { x: (this.startRoom.rx + 0.5) * this.roomPxW, y: (this.startRoom.ry + 0.3) * this.roomPxH };
    if (!start) start = { x: 2 * T, y: 4 * T };

    this.player = new Player(this, start.x, start.y, this.cfg);
    if (this.savedEntry) this.player.setVelocity(this.savedEntry.vx, this.savedEntry.vy);
    this.physics.add.collider(this.player, this.terrain.layer);

    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);

    // 输入
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys({ A: 'A', D: 'D' }) as Record<'A' | 'D', Phaser.Input.Keyboard.Key>;
    const press = () => this.player.pressJump(this.time.now);
    kb.on('keydown-SPACE', press); kb.on('keydown-UP', press); kb.on('keydown-W', press);
    kb.on('keydown-R', () => { if (!this.won) this.resetRoom(); });
    if (this.playtest) kb.on('keydown-ESC', () => this.exitPlaytest());

    this.preview = this.add.graphics().setDepth(8);
    this.sparks = createSparkEmitter(this);

    store.dispatch(setMode({ mode: 'playing', playtest: this.playtest }));
    store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => store.dispatch(setMode({ mode: 'idle' })));
  }

  // ---------- EntityHost ----------
  addEnemy(spawn: EnemySpawn): void { this.enemySpawns.push(spawn); this.spawnEnemy(spawn); }
  setGoal(p: Point): void {
    this.goal = p;
    this.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.cfg.tile / 2);
  }

  // ---------- 房间 ----------
  private roomOf(x: number, y: number): RoomCoord { return { rx: Math.floor(x / this.roomPxW), ry: Math.floor(y / this.roomPxH) }; }
  private sameRoom(a: RoomCoord, b: RoomCoord): boolean { return a.rx === b.rx && a.ry === b.ry; }

  private enterRoom(r: RoomCoord, instant: boolean): void {
    this.room = r;
    const sx = r.rx * this.roomPxW, sy = r.ry * this.roomPxH;
    this.tweens.killTweensOf(this.cameras.main);
    if (instant) this.cameras.main.setScroll(sx, sy);
    else this.tweens.add({ targets: this.cameras.main, scrollX: sx, scrollY: sy, duration: this.cfg.roomPanMs, ease: 'Sine.out' });
    const key = roomKeyAt(this.model, r.rx, r.ry);
    store.dispatch(setRoomInfo({ key: key ?? '?', name: roomName(this.model, key) }));
  }

  /** 进入新房间：记录入口状态（位置 + 速度），重置时回到这里；顺便存档 */
  private onRoomChanged(r: RoomCoord): void {
    const p = this.player, T = this.cfg.tile;
    const nx = Phaser.Math.Clamp(p.x, r.rx * this.roomPxW + T * 0.6, (r.rx + 1) * this.roomPxW - T * 0.6);
    const ny = Phaser.Math.Clamp(p.y, r.ry * this.roomPxH + T * 0.6, (r.ry + 1) * this.roomPxH - T * 0.6);
    this.prevEntry = this.entry;
    this.entry = { x: nx, y: ny, vx: p.body.velocity.x, vy: p.body.velocity.y };
    this.enterRoom(r, false);
    if (!this.playtest) this.autosave();
  }

  private autosave(): void {
    store.dispatch(writeSave({ rows: this.terrain.rows(), room: this.room, entry: this.entry, stats: { jumps: this.jumps, destroyed: this.destroyed } }));
  }

  private resetRoom(): void {
    this.terrain.resetRect(this.room.rx * this.roomW, this.room.ry * this.roomH, this.roomW, this.roomH);
    (this.enemies.getChildren() as Enemy[]).forEach(e => { if (e.active && this.sameRoom(e.spawn, this.room)) e.destroy(); });
    this.enemySpawns.filter(sp => this.sameRoom(sp, this.room)).forEach(sp => this.spawnEnemy(sp));
    this.player.respawn(this.entry);
    this.dead = false;
    this.lastResetAt = this.time.now;
    this.flash('房间已重置', '#9ad1ff');
  }

  private exitPlaytest(): void {
    bridge.emit(EVT.playtestExit);
    this.scene.start(SCENE.editor);
  }

  // ---------- 怪物 ----------
  private spawnEnemy(sp: EnemySpawn): void { this.enemies.add(new Enemy(this, sp)); }

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

  // ---------- 爆炸 / 预览 ----------
  private detonate(cell: CellRef): void {
    const removed = this.terrain.explode(cell.x, cell.y);
    this.destroyed += removed.length;
    playExplosion(this, this.sparks, this.cfg.tile, cell, removed, this.cfg.explosionRadius);
  }

  private drawPreview(cell: CellRef | null): void {
    const T = this.cfg.tile, g = this.preview;
    g.clear();
    if (!cell) return;
    g.lineStyle(1, 0xffffff, 0.25);
    this.terrain.blastCells(cell.x, cell.y, this.cfg.explosionRadius).forEach(c => g.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2));
    this.terrain.previewExplosion(cell.x, cell.y).forEach(c => {
      g.fillStyle(0xffffff, 0.35); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(c.def.color, 0.6); g.fillRect(c.x * T + 4, c.y * T + 4, T - 8, T - 8);
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

  private onChunkLand(cells: CellRef[]): void {
    playLand(this);
    if (!this.dead && !this.won && this.terrain.cellsOverlapRect(cells, this.player.body)) this.die('被落石埋住了');
    (this.enemies.getChildren() as Enemy[]).forEach(e => { if (e.active && this.terrain.cellsOverlapRect(cells, e.body)) this.killEnemy(e); });
  }

  private touchingHazard(): string | null {
    const b = this.player.body, T = this.cfg.tile;
    const pts: [number, number][] = [[b.left + 3, b.bottom - 2], [b.right - 3, b.bottom - 2], [b.center.x, b.center.y], [b.left + 3, b.top + 2], [b.right - 3, b.top + 2]];
    for (const [x, y] of pts) { const h = this.terrain.def(Math.floor(x / T), Math.floor(y / T)).hazard; if (h) return h; }
    return null;
  }

  update(time: number, delta: number): void {
    this.terrain.updateChunks(delta / 1000);
    this.updateEnemies();
    if (this.dead || this.won) { this.drawPreview(null); return; }

    const p = this.player;
    const r = this.roomOf(p.x, p.y);
    if (!this.sameRoom(r, this.room)) this.onRoomChanged(r);

    const input = { left: this.cursors.left.isDown || this.keys.A.isDown, right: this.cursors.right.isDown || this.keys.D.isDown };
    const jump = p.step(input, time);
    if (jump) { this.jumps += 1; this.detonate(jump.cell); store.dispatch(setStats({ jumps: this.jumps, destroyed: this.destroyed })); }

    this.drawPreview(p.previewCell());
    this.handleChunkContact();
    if (this.dead) return;
    const hazard = this.touchingHazard();
    if (hazard) { this.die(hazard); return; }
    if (this.goal && Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 24) this.win();
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
    this.time.delayedCall(550, () => { if (this.dead) this.resetRoom(); });
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
