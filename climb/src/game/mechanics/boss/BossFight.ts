// ===== Boss 房：进门封门 → 大史莱姆落下 → 只有落石和引线能伤它 → 打赢开门、爆开一圈穿墙火花 =====
// 打赢之后：第一层、死在别的房间 → 回到 Boss 房，Boss 在你眼前再炸一次（引线重新点、路重新开）；
// 死在 Boss 房里、或不在第一层 → Boss 回来，重新打。
import Phaser from 'phaser';
import type { CellRef, EnemySpawn, EntryState, Point, RoomCoord } from '@/type';
import { floorIndex } from '@/game/world/WorldModel';
import { Enemy } from '@/sprite';
import { playCrush } from '@/particle';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { Boss } from './Boss';
import { SparkBurst } from './SparkBurst';

/** 玩家离门口多远（格）才封门 */
const SEAL_DISTANCE = 1.5;
/** 封门之后多久 Boss 落下 */
const SPAWN_DELAY_MS = 350;
/** 一次落石最多扣几格 */
const MAX_CHUNK_DAMAGE = 4;
const FUSE_DAMAGE = 2;

export class BossFight implements Mechanic {
  private spawns: EnemySpawn[] = [];
  private boss: Boss | null = null;
  /** Boss 和地形的碰撞器，必须随 Boss 一起销毁：留着会每帧去碰一个没有物理体的对象，把物理循环炸掉 */
  private collider: Phaser.Physics.Arcade.Collider | null = null;
  private room: RoomCoord | null = null;
  private doors: CellRef[] = [];
  /** 还没封上的门（等玩家离开门口再封） */
  private doorsPending: CellRef[] = [];
  private defeated = new Set<string>();
  /** 封门时的位置：打赢之后死了就回到这里 */
  private sealEntry: EntryState | null = null;
  /** 打赢的 Boss：复活点（封门处）、倒下的位置、房间 key */
  private won: { entry: EntryState; at: Point; key: string | null } | null = null;
  private bursts: SparkBurst[] = [];

  constructor(private ctx: PlayContext) {}

  addBoss(spawn: EnemySpawn): void { this.spawns.push(spawn); }

  // ---------- 生命周期 ----------
  /** 进层时也会对出生房间调一次 */
  onRoomChanged(r: RoomCoord): void { if (this.hasBoss(r)) this.startBoss(r); }

  update(now: number, dt: number): void {
    this.sealDoors();
    this.updateBoss(now);
    this.updateBursts(dt);
  }

  onClear(): void {
    if (this.boss || this.doors.length || this.doorsPending.length) this.end(false);
    this.bursts.forEach(b => b.destroy()); this.bursts = [];
  }

  onReset(scope: 'room' | 'world'): EntryState | void {
    const { ctx } = this;
    if (scope === 'room') {
      // 在 Boss 房里重置：Boss 回来，重新打
      if (this.inWonRoom(ctx.rooms.current)) this.forgetWin();
      if (this.hasBoss(ctx.rooms.current)) this.startBoss(ctx.rooms.current);
      return;
    }
    const replay = !!this.won && floorIndex(ctx.project, ctx.floor.id) === 0 && !this.inWonRoom(ctx.rooms.current);
    const won = replay ? this.won : null;
    if (!replay) this.forgetWin();
    this.defeated.clear();
    if (won?.key) this.defeated.add(won.key);
    if (won) {
      // 直接回到 Boss 房，Boss 再炸一次
      this.replayDeath(won.at);
      return won.entry;
    }
    if (this.hasBoss(ctx.rooms.current)) this.startBoss(ctx.rooms.current);
  }

  onFuseBurn(cells: CellRef[]): void {
    if (this.boss && this.ctx.terrain.cellsOverlapRect(cells, this.boss.body)) this.hurt(FUSE_DAMAGE);
  }

  vortexTargets(): Suckable[] { return this.boss ? [this.boss] : []; }

  // ---------- 内部 ----------
  /** 这个房间有没有 Boss（放了 Boss 物件，或旧的房间开关），且还没被打败 */
  private hasBoss(r: RoomCoord): boolean {
    const key = this.ctx.rooms.key(r);
    if (!key || this.defeated.has(key)) return false;
    return this.spawns.some(sp => this.ctx.rooms.same(sp, r)) || this.ctx.rooms.flag(r, 'boss');
  }

  private inWonRoom(r: RoomCoord): boolean { return !!this.won && this.ctx.rooms.same(this.ctx.rooms.of(this.won.entry.x, this.won.entry.y), r); }
  /** 当作没打过：Boss 会在下次进房 / 重置时回来 */
  private forgetWin(): void { this.won = null; this.defeated.clear(); }

  /** 玩家进 Boss 房：先不出 Boss，只记下要封的门，等玩家走进来一点再封门、再出场 */
  private startBoss(r: RoomCoord): void {
    const { rooms, terrain } = this.ctx;
    const x0 = r.rx * rooms.w, y0 = r.ry * rooms.h;
    this.room = r;
    this.doors = []; this.doorsPending = [];
    for (let y = y0; y < y0 + rooms.h; y++) for (const x of [x0, x0 + rooms.w - 1]) {
      if (!terrain.isSolid(x, y)) this.doorsPending.push({ x, y });
    }
  }

  /** 玩家离门口一格半以上就把门封上；复活点就定在关门的这个位置 */
  private sealDoors(): void {
    if (!this.doorsPending.length) return;
    const { ctx } = this, T = ctx.cfg.tile, b = ctx.player.body;
    const clear = this.doorsPending.every(c => {
      const cx = c.x * T + T / 2, cy = c.y * T + T / 2;
      return Math.abs(b.center.x - cx) > SEAL_DISTANCE * T || Math.abs(b.center.y - cy) > SEAL_DISTANCE * T;
    });
    if (!clear) return;
    this.doorsPending.forEach(c => { this.doors.push(c); ctx.terrain.set(c.x, c.y, 'R'); });
    this.doorsPending = [];
    ctx.scene.cameras.main.shake(120, 0.005);
    ctx.fx.fogDirty();
    ctx.entry = { x: ctx.player.x, y: ctx.player.y, vx: 0, vy: 0 };
    this.sealEntry = ctx.entry;
    ctx.scene.time.delayedCall(SPAWN_DELAY_MS, () => { if (this.room && !this.boss && this.doors.length) this.spawnBoss(this.room); });
  }

  /** 门关上之后 Boss 才从放物件的位置落下 */
  private spawnBoss(r: RoomCoord): void {
    const { ctx } = this, T = ctx.cfg.tile, x0 = r.rx * ctx.rooms.w, y0 = r.ry * ctx.rooms.h;
    const sp = this.spawns.find(b => ctx.rooms.same(b, r));
    const bx = sp ? sp.x : (x0 + ctx.rooms.w / 2) * T, by = sp ? sp.y : (y0 + 1.5) * T;
    this.boss = new Boss(ctx.scene, bx, by, { hp: ctx.cfg.bossHp, hopMs: ctx.cfg.bossHopMs, spitMs: ctx.cfg.bossSpitMs, tile: T });
    this.collider = ctx.scene.physics.add.collider(this.boss, ctx.terrain.layer);
    ctx.hud.boss({ hp: this.boss.hp, max: this.boss.maxHp });
    ctx.music.play('bossMusic');
    ctx.scene.cameras.main.shake(300, 0.012);
    ctx.fx.flash('大史莱姆！', '#9b5de5');
    ctx.fx.fogDirty();
  }

  private end(defeated: boolean): void {
    const { ctx } = this;
    this.collider?.destroy(); this.collider = null;
    if (this.boss) { this.boss.destroy(); this.boss = null; }
    this.doorsPending = [];
    // 开门：封门的格子恢复成原样
    this.doors.forEach(c => ctx.terrain.set(c.x, c.y, ctx.terrain.original[c.y][c.x]));
    this.doors = [];
    if (defeated && this.room) { const key = ctx.rooms.key(this.room); if (key) this.defeated.add(key); }
    this.room = null;
    ctx.hud.boss(null);
    ctx.music.playBase();
    ctx.fx.fogDirty();
  }

  private hurt(amount: number): void {
    const { ctx } = this, now = ctx.scene.time.now;
    if (!this.boss || this.boss.invulnerable(now)) return;
    const boss = this.boss;
    const dead = boss.hurt(amount, now);
    ctx.hud.boss({ hp: boss.hp, max: boss.maxHp });
    ctx.scene.cameras.main.shake(120, 0.008);
    if (!dead) return;
    this.explode(boss.x, boss.y);
    ctx.fx.flash('大史莱姆倒下了', '#ffd166');
    if (this.sealEntry && this.room) this.won = { entry: this.sealEntry, at: { x: boss.x, y: boss.y }, key: ctx.rooms.key(this.room) };
    this.end(true);
  }

  private updateBoss(now: number): void {
    if (!this.boss) return;
    const { ctx } = this, boss = this.boss, T = ctx.cfg.tile;
    const ev = boss.step(now, { x: ctx.player.x, y: ctx.player.y });
    const feet = { x: Math.floor(boss.x / T), y: Math.floor(boss.body.bottom / T) };
    if (ev.heavyLanded) { ctx.scene.cameras.main.shake(260, 0.012); ctx.terrain.shake([feet], 2.5); }
    else if (ev.landed) { ctx.scene.cameras.main.shake(120, 0.005); ctx.terrain.shake([feet], 1.5); }
    if (ev.spit) this.spitMinions(boss);
    // 快速下落的碎块砸中 → 扣血，碎块被吞掉
    const rect = boss.rect();
    if (!boss.invulnerable(now)) {
      ctx.terrain.chunks.slice().forEach(ch => {
        if (ch.vy < ctx.cfg.crushMinSpeed || boss.hitBy.has(ch.id)) return;
        let hits = 0;
        ctx.terrain.forEachChunkCell((c, cx, cy, w, h) => { if (c === ch && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), rect)) hits++; });
        if (!hits) return;
        boss.hitBy.add(ch.id);
        ctx.debris.removeChunk(ch);
        ctx.sparks.explode(12, boss.x, boss.body.top);
        this.hurt(Math.min(MAX_CHUNK_DAMAGE, hits));
      });
    }
    if (!this.boss) return;
    // 碰到即死：致命矩形对玩家收 3 像素的矩形，贴上去才算
    if (ctx.dead || ctx.won) return;
    const pb = ctx.player.body;
    const pr = new Phaser.Geom.Rectangle(pb.x + 3, pb.y + 3, pb.width - 6, pb.height - 6);
    if (Phaser.Geom.Intersects.RectangleToRectangle(boss.lethalRect(), pr)) ctx.die('被大史莱姆吞了');
  }

  private spitMinions(boss: Boss): void {
    const { ctx } = this;
    const alive = ctx.enemies.list().length;
    const room = this.room ?? ctx.rooms.current;
    for (let i = 0; i < 2 && alive + i < ctx.cfg.bossMaxMinions; i++) {
      const e = new Enemy(ctx.scene, { x: boss.x, y: boss.body.top, rx: room.rx, ry: room.ry });
      e.setVelocity((i === 0 ? -1 : 1) * (120 + Math.random() * 80), -260);
      ctx.enemies.add(e);
    }
    ctx.sparks.explode(8, boss.x, boss.body.top);
  }

  /** 爆开：碎屑 + 一圈穿墙火花，火花唯一作用是点燃碰到的引线端点 */
  private explode(x: number, y: number): void {
    const { ctx } = this;
    playCrush(ctx.sparks, x, y);
    for (let i = 0; i < 6; i++) ctx.sparks.explode(10, x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.5) * 60);
    this.bursts.push(new SparkBurst(ctx.scene, x, y, ctx.cfg.bossBurstCount, ctx.cfg.bossBurstSpeed, ctx.cfg.tile, ctx.cfg.bossBurstTtl));
    ctx.scene.cameras.main.shake(400, 0.015);
  }

  /** 打赢之后死了：Boss 出现即炸开，重演开路那一下 */
  private replayDeath(at: Point): void {
    const scene = this.ctx.scene;
    const ghost = scene.add.image(at.x, at.y, 'boss').setDepth(5).setAlpha(0.85).setScale(0.6);
    scene.tweens.add({ targets: ghost, scale: 1.15, alpha: 1, duration: 320, ease: 'Back.out', onComplete: () => { ghost.destroy(); this.explode(at.x, at.y); } });
  }

  private updateBursts(dt: number): void {
    if (!this.bursts.length) return;
    const { ctx } = this;
    let lit = 0;
    this.bursts.forEach(b => b.update(dt, cell => {
      if (!ctx.fuses.isEnd(cell.x, cell.y)) return false;
      if (ctx.igniteFuses([cell])) lit++;
      return true;
    }));
    if (lit) ctx.fx.flash('引线点燃！', '#ff7b54');
    this.bursts = this.bursts.filter(b => b.alive);
  }
}
