// ===== Boss 房：进门封门（房间四边的开口，见 seal.ts）→ 出场过场 → 只有落石和引线能伤它 → 打赢开门、爆开一圈穿墙火花 =====
// 出场过场：WARNING 警报（warning.mp3 用 1.5 倍速正好放两遍）→ 安静 1 秒 → 史莱姆王从房间顶上掉下来 → 落地后血条一格格涨满（每格「滴」一声）→ 亮名字、Boss 曲响起 → 才开始动。
// 过场中它不动、打不疼、碰到也不死，落地不震松地形（不然 Boss 房里设计好的脆岩会提前掉）。
// 被玩家贴得太紧吓跑时（Boss 的 flee 事件）：脚下铺一滩黏液、朝玩家那边甩两团，落地也摊成一滩。黏液滑：
// 玩家站在上面像溜冰，松手停不下来、转身很慢（updateAlive 里在正常移动之后改速度，不动玩家自己的移动代码）。
// 打赢过的 Boss 房记在 defeated 里，不再出 Boss；在那个房间里按 R（房间复原）、重置整张地图时 Boss 回来，重新打。
import Phaser from 'phaser';
import type { CellRef, EnemySpawn, RoomCoord } from '@/type';
import { Enemy } from '@/sprite';
import { playCrush } from '@/particle';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';
import { Boss, type Arena } from './Boss';
import { BOSS_TEX } from './bossArt';
import { CHARGE } from './charge';
import { FUSE_CHANNELS } from '@/game/fuse/channels';
import type { FuseEnd } from '@/game/fuse/Fuse';
import { SparkBurst } from './SparkBurst';
import { SEAL } from './seal';
import { createBossSound, type BossSound } from '@/audio/bossSound';
import { Colors, hex } from '@/shared/palette';
import { overlaps } from '@/game/core/overlap';

/** Boss 战的音乐（音频清单里的 key） */
const BOSS_MUSIC = 'bossMusic';
/** 血条下面的名字（i18n key；和出场时亮出来的名字是同一个） */
const BOSS_NAME = 'bossIntro.name';
/** 玩家离门口多远（格）才封门 */
const SEAL_DISTANCE = 1.5;
/** WARNING 警报正好放几遍 warning.mp3（显示多久跟着音频长度走，换了音频不用改） */
const WARNING_PLAYS = 2;
/** warning.mp3 用几倍速放（更急；音调也会跟着变高） */
const WARNING_RATE = 1.5;
/** 拿不到音频长度（没加载上、浏览器不让出声）时 WARNING 显示多久 */
const WARNING_FALLBACK_MS = 3100;
/** 警报停了之后安静多久，Boss 再掉下来 */
const PAUSE_MS = 1000;
/** WARNING 的警报声（音频清单里的 key） */
const WARNING_SOUND = 'warning';
/** 落地后血条每涨一格隔多久 */
const FILL_STEP_MS = 130;
/** 名字亮多久，Boss 才开始动 */
const TITLE_MS = 1900;
/** 一次落石最多扣几格 */
const MAX_CHUNK_DAMAGE = 4;
const FUSE_DAMAGE = 2;
/** 一滩黏液留多久、最后多久开始淡掉 */
const SLIME_MS = 10000, SLIME_FADE_MS = 1500;
/** 黏液上：按方向键时速度往目标靠的加速度、松手时的减速度（像素/秒²），越小越滑 */
const ICE_ACCEL = 320, ICE_FRICTION = 90;
/** 甩出去的黏液团最多飞多久（落不了地就算了） */
const BLOB_TTL_MS = 3000;
/** 王之炸药炸到另一块王之炸药：隔多久接着炸 */
const CHARGE_CHAIN_MS = 140;

export class BossFight implements Mechanic {
  private spawns: EnemySpawn[] = [];
  /** Boss 触发点（编辑器里涂的格子，格子中心）：这个房间有的话，玩家要碰到其中一格才封门 */
  private triggers: EnemySpawn[] = [];
  /** 这次进房玩家已经碰过触发线了：等他离开门口够远就封门 */
  private armed = false;
  /**
   * 重置前门已经封上了（Boss 战打到一半死了 / 按 R）：重置后不用再碰触发点。复活点在封门处（场地里面），
   * 触发点多半在门口外面，人碰不到它，门就一直不封、Boss 一直不来，玩家困在空的 Boss 房里
   */
  private rearm = false;
  private boss: Boss | null = null;
  /** Boss 和地形的碰撞器，必须随 Boss 一起销毁：留着会每帧去碰一个没有物理体的对象，把物理循环炸掉 */
  private collider: Phaser.Physics.Arcade.Collider | null = null;
  private room: RoomCoord | null = null;
  private doors: CellRef[] = [];
  /** 还没封上的门（等玩家离开门口再封） */
  private doorsPending: CellRef[] = [];
  /** 打赢过的 Boss 房（房间 key） */
  private defeated = new Set<string>();
  /** 打赢之后解开了的 Boss 房（房间 key）：重置也不再出 Boss */
  private solved = new Set<string>();
  private bursts: SparkBurst[] = [];
  /** Boss 吐出来的小夹子桑（上限只数这些，地图上的巡逻怪不算）；Boss 死的时候一起死 */
  private minions: Enemy[] = [];
  /** 上次吐怪的时间：两次之间至少隔 bossSpitMs */
  private lastSpitAt = -Infinity;
  /** 出场过场走到哪一步；null = 没在过场（还没封门、或者已经开打） */
  private intro: 'warning' | 'pause' | 'falling' | 'filling' | 'title' | null = null;
  /** 正在循环放的 WARNING 警报声 */
  private alarm: Phaser.Sound.BaseSound | null = null;
  /** 过场的计时器：重置时要取消（只重置一个房间时场景不会清掉所有计时器） */
  private introTimers: Phaser.Time.TimerEvent[] = [];
  private sound: BossSound | null = null;
  /** 地上的黏液：「格子 x,y」（y 是黏液铺在上面的那块地）→ 贴图和消失时间 */
  private slime = new Map<string, { img: Phaser.GameObjects.Image; until: number }>();
  /** 飞在空中的黏液团 */
  private blobs: { img: Phaser.Physics.Arcade.Image; until: number }[] = [];
  private blobGroup: Phaser.Physics.Arcade.Group | null = null;
  /** 玩家在黏液上滑的速度（不在黏液上 = null） */
  private iceVx: number | null = null;
  /** 排着队等炸的王之炸药（重置时取消） */
  private chargeTimers: Phaser.Time.TimerEvent[] = [];
  private pendingCharges = new Map<Phaser.Time.TimerEvent, { cx: number; cy: number }>();

  constructor(private ctx: PlayContext) {}

  addTrigger(at: EnemySpawn): void { this.triggers.push(at); }

  addBoss(spawn: EnemySpawn): void {
    this.spawns.push(spawn);
    this.ctx.music.preload(BOSS_MUSIC);   // 这一层有 Boss：进层就开始下 Boss 曲，打起来的时候已经有了
  }

  // ---------- 生命周期 ----------
  /** 进层时也会对出生房间调一次 */
  onRoomChanged(r: RoomCoord): void { if (this.hasBoss(r)) this.startBoss(r); }

  update(now: number, dt: number): void {
    this.sealDoors();
    this.updateBoss(now);
    this.updateBursts(dt);
    this.updateSlime(now);
  }

  /** 正常移动算完之后：站在黏液上就改成溜冰 */
  updateAlive(_now: number, dt: number): void { this.skate(dt); }

  onClear(): void {
    this.rearm = this.doors.length > 0;
    this.cancelIntro();
    this.chargeTimers.forEach(t => t.remove(false)); this.chargeTimers = []; this.pendingCharges.clear();
    if (this.boss || this.doors.length || this.doorsPending.length) this.end(false);
    this.bursts.forEach(b => b.destroy()); this.bursts = [];
  }

  /** 场景关闭（换层、重开）：合成音那一路断开 */
  destroy(): void { this.sound?.close(); this.sound = null; }

  onReset(scope: 'room' | 'world' | 'level'): void {
    const { ctx } = this;
    // 在打赢过的 Boss 房里按 R（房间复原）：Boss 回来，重新打；重置整张地图、进入下一关（长大）：所有 Boss 都回来
    // 解开了的 Boss 房不算（core/Solves.ts）：打赢就是打赢了
    if (scope === 'room') { const key = ctx.rooms.key(ctx.rooms.current); if (key && !this.solved.has(key)) this.defeated.delete(key); }
    else this.defeated = new Set(this.solved);
    if (scope !== 'level' && this.hasBoss(ctx.rooms.current)) {   // 进入下一关：人回出生点后 onRoomChanged 会再判一次
      this.startBoss(ctx.rooms.current);
      if (this.rearm) this.armed = true;   // 打到一半重来：人在场地里复活，直接等他站稳就封门、Boss 重新出场
    }
    this.rearm = false;
  }

  checkpointState() {
    const now = this.ctx.scene.time.now;
    return { defeated: [...this.defeated], solved: [...this.solved],
      charges: [...this.pendingCharges].map(([t, c]) => ({ ...c, ms: t.getRemaining() })), bursts: this.bursts.map(b => b.checkpointState()),
      boss: this.boss?.checkpointState() ?? null, room: this.room, doors: this.doors, doorsPending: this.doorsPending,
      armed: this.armed, intro: this.intro, lastSpitAgo: Number.isFinite(this.lastSpitAt) ? now - this.lastSpitAt : null,
      minions: this.minions.map(e => this.ctx.enemies.list().indexOf(e)).filter(i => i >= 0),
      slime: [...this.slime].map(([key, s]) => ({ key, ms: Math.max(0, s.until - now) })),
      blobs: this.blobs.map(b => ({ x: b.img.x, y: b.img.y, vx: (b.img.body as Phaser.Physics.Arcade.Body).velocity.x, vy: (b.img.body as Phaser.Physics.Arcade.Body).velocity.y, ms: Math.max(0, b.until - now) })), iceVx: this.iceVx,
    };
  }

  restoreCheckpoint(data: unknown): void {
    const s = data as ReturnType<BossFight['checkpointState']>;
    if (!s || !Array.isArray(s.defeated) || !Array.isArray(s.solved)) return;
    const { ctx } = this, now = ctx.scene.time.now;
    this.defeated = new Set(s.defeated); this.solved = new Set(s.solved);
    this.room = s.room ? { ...s.room } : null; this.doors = s.doors.map(c => ({ ...c })); this.doorsPending = s.doorsPending.map(c => ({ ...c })); this.armed = s.armed;
    this.lastSpitAt = s.lastSpitAgo === null ? -Infinity : now - s.lastSpitAgo;
    this.minions = s.minions.flatMap(i => ctx.enemies.list()[i] ? [ctx.enemies.list()[i]] : []);
    if (s.boss) {
      this.boss = new Boss(ctx.scene, s.boss.x, s.boss.y, { hp: ctx.cfg.bossHp, hopMs: ctx.cfg.bossHopMs, spitMs: ctx.cfg.bossSpitMs, tile: ctx.cfg.tile });
      this.boss.restoreCheckpoint(s.boss); this.collider = ctx.scene.physics.add.collider(this.boss, ctx.terrain.layer);
      if (s.intro === 'falling') this.intro = 'falling';
      else if (s.intro) this.introLanded(this.boss);
      else { ctx.hud.boss({ hp: this.boss.hp, max: this.boss.maxHp, name: BOSS_NAME }); ctx.music.play(BOSS_MUSIC); }
    } else if (s.intro && this.room && this.doors.length) this.startIntro();
    s.charges.forEach(c => this.queueCharge(c.cx, c.cy, c.ms));
    this.bursts = s.bursts.map(b => {
      const burst = new SparkBurst(ctx.scene, 0, 0, 0, 0, ctx.cfg.tile, 0);
      burst.restoreCheckpoint(ctx.scene, b); return burst;
    });
    s.slime.forEach(v => {
      const [x, row] = v.key.split(',').map(Number), T = ctx.cfg.tile;
      const img = ctx.scene.add.image(x * T, row * T - 6, BOSS_TEX.gooFloor).setOrigin(0, 0).setDepth(3);
      this.slime.set(v.key, { img, until: now + v.ms });
    });
    if (s.blobs.length) {
      this.blobGroup = ctx.scene.physics.add.group(); ctx.scene.physics.add.collider(this.blobGroup, ctx.terrain.layer);
      this.blobs = s.blobs.map(v => {
        const img = this.blobGroup!.create(v.x, v.y, BOSS_TEX.goo) as Phaser.Physics.Arcade.Image;
        img.setScale(2.2).setDepth(9.2).setVelocity(v.vx, v.vy); return { img, until: now + v.ms };
      });
    }
    this.iceVx = s.iceVx;
  }

  // ---------- 解开 ----------
  /** 这个房间的 Boss 打赢了吗 */
  isDefeated(r: RoomCoord): boolean { const key = this.ctx.rooms.key(r); return !!key && this.defeated.has(key); }

  /** 王之炸药还在排队炸、火花圈还在扩：等完了再记 */
  settling(): boolean { return this.chargeTimers.length > 0 || this.bursts.length > 0; }

  onSolve(r: RoomCoord): void { const key = this.ctx.rooms.key(r); if (key && this.defeated.has(key)) this.solved.add(key); }

  solvedState(r: RoomCoord): true | undefined { const key = this.ctx.rooms.key(r); return key && this.solved.has(key) ? true : undefined; }

  restoreSolved(r: RoomCoord, data: unknown): void {
    const key = this.ctx.rooms.key(r);
    if (key && data === true) { this.solved.add(key); this.defeated.add(key); }
  }

  /** 死了不重置的模式下，Boss 战打到一半死了：还是重开这个房间（Boss 重新出场、房间里的落石和引线复原），不然 Boss 压在复活点上、能砸它的东西也用光了 */
  resetsRoomOnDeath(): boolean { return !!this.boss || this.doors.length > 0 || this.doorsPending.length > 0; }

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


  /** 玩家进 Boss 房：先不出 Boss，只记下要封的门（房间四条边上所有不是实心的格子），等玩家走进来一点再封门、再出场 */
  private startBoss(r: RoomCoord): void {
    if (this.boss || this.doors.length) return;   // 已经在打了（比如从没封上的口子出去又进来）：别把封门的记录清掉
    const { rooms, terrain } = this.ctx;
    const x0 = r.rx * rooms.w, y0 = r.ry * rooms.h, x1 = x0 + rooms.w - 1, y1 = y0 + rooms.h - 1;
    this.room = r;
    this.armed = false;
    this.doorsPending = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge && !terrain.isSolid(x, y)) this.doorsPending.push({ x, y });
    }
  }

  /** 玩家在 Boss 房里、离门口一格半以上就把门封上（房里涂了触发点的话要先碰到它）；复活点就定在关门的这个位置 */
  private sealDoors(): void {
    if (!this.doorsPending.length || !this.room) return;
    const { ctx } = this, T = ctx.cfg.tile, b = ctx.player.body;
    if (ctx.appearing) return;   // 人还被骷髅手捏着在空中：等放下了再判断，复活点才不会记在半空
    // 人不在 Boss 房里（比如刚进来又退回门外）就不封，而且把没封的门忘掉：下次进房 startBoss 会重新记。
    // 不能留着等：场景每帧先跑机制再判断换房间，留着的旧门会在人重新进房的那一帧先被封上，
    // 紧接着 startBoss 又把门的记录清空，结果门封死了、Boss 也不出来
    if (!ctx.rooms.same(ctx.rooms.of(b.center.x, b.center.y), this.room)) { this.doorsPending = []; return; }
    // 房里涂了触发点：玩家的身体碰到其中任何一格才算数（之后照样等他离开门口，免得把人封进门里）
    const cells = this.triggers.filter(t => ctx.rooms.same(t, this.room!));
    if (cells.length && !this.armed) {
      const touches = (t: EnemySpawn) => b.right > t.x - T / 2 && b.left < t.x + T / 2 && b.bottom > t.y - T / 2 && b.top < t.y + T / 2;
      if (!cells.some(touches)) return;
      this.armed = true;
    }
    const clear = this.doorsPending.every(c => {
      const cx = c.x * T + T / 2, cy = c.y * T + T / 2;
      return Math.abs(b.center.x - cx) > SEAL_DISTANCE * T || Math.abs(b.center.y - cy) > SEAL_DISTANCE * T;
    });
    if (!clear) return;
    this.doorsPending.forEach(c => { this.doors.push(c); ctx.terrain.set(c.x, c.y, SEAL.id); });
    this.doorsPending = [];
    ctx.scene.cameras.main.shake(120, 0.005);
    ctx.fx.fogDirty();
    ctx.entry = { x: ctx.player.x, y: ctx.player.y, vx: 0, vy: 0 };
    this.startIntro();
  }

  // ---------- 出场过场 ----------
  private later(ms: number, fn: () => void): void { this.introTimers.push(this.ctx.scene.time.delayedCall(ms, fn)); }
  private cancelIntro(): void {
    this.introTimers.forEach(t => t.remove(false)); this.introTimers = [];
    this.stopAlarm();
    if (this.intro) this.ctx.hud.bossIntro(null);
    this.intro = null;
  }

  private stopAlarm(): void { this.alarm?.stop(); this.alarm?.destroy(); this.alarm = null; }

  /** 门封上：WARNING 警报把 warning.mp3 放 WARNING_PLAYS 遍，停了安静 PAUSE_MS，然后 Boss 掉下来 */
  private startIntro(): void {
    const { ctx } = this, scene = ctx.scene;
    this.sound ??= createBossSound();
    this.intro = 'warning';
    ctx.hud.bossIntro('warning');
    let warnMs = WARNING_FALLBACK_MS;
    if (scene.cache.audio.exists(WARNING_SOUND)) {
      this.alarm = scene.sound.add(WARNING_SOUND, { loop: true, volume: 0.8, rate: WARNING_RATE });
      this.alarm.play();
      if (this.alarm.duration > 0) warnMs = this.alarm.duration * 1000 * WARNING_PLAYS / WARNING_RATE;   // duration 是原速的长度
    }
    this.later(warnMs, () => {
      ctx.hud.bossIntro(null);
      this.stopAlarm();
      this.intro = 'pause';
      this.later(PAUSE_MS, () => {
        if (this.room && !this.boss && this.doors.length) { this.intro = 'falling'; this.spawnBoss(this.room); }
        else this.intro = null;
      });
    });
  }

  /** 落地：一震，血条从空开始一格格涨满 */
  private introLanded(boss: Boss): void {
    const { ctx } = this;
    this.intro = 'filling';
    ctx.scene.cameras.main.shake(320, 0.014);
    for (let i = 0; i < 5; i++) ctx.sparks.explode(6, boss.x + (i - 2) * 18, boss.body.bottom - 4);
    ctx.hud.boss({ hp: 0, max: boss.maxHp, name: BOSS_NAME });
    for (let k = 1; k <= boss.maxHp; k++) {
      this.later(250 + k * FILL_STEP_MS, () => {
        ctx.hud.boss({ hp: k, max: boss.maxHp, name: BOSS_NAME });
        this.sound?.beep(k, boss.maxHp);
        if (k === boss.maxHp) this.later(220, () => this.introTitle());
      });
    }
  }

  /** 血条满了：亮名字、Boss 曲响起，过一会儿才开始动 */
  private introTitle(): void {
    const { ctx } = this;
    this.intro = 'title';
    ctx.hud.bossIntro('title');
    this.sound?.title();
    this.boss?.roar(ctx.scene.time.now, TITLE_MS * 0.6);
    ctx.music.play(BOSS_MUSIC);
    ctx.scene.cameras.main.shake(200, 0.006);
    this.later(TITLE_MS, () => {
      ctx.hud.bossIntro(null);
      this.intro = null;
      this.boss?.activate(ctx.scene.time.now);
    });
  }

  /** WARNING 之后 Boss 从放物件的那一列、尽量高的地方（往上到房顶，中间 3 格宽都是空的）掉下来；血条落地后才涨 */
  private spawnBoss(r: RoomCoord): void {
    const { ctx } = this, T = ctx.cfg.tile, x0 = r.rx * ctx.rooms.w, y0 = r.ry * ctx.rooms.h;
    const sp = this.spawns.find(b => ctx.rooms.same(b, r));
    const bx = sp ? sp.x : (x0 + ctx.rooms.w / 2) * T;
    const cx = Math.floor(bx / T);
    let cy = Math.floor((sp ? sp.y : (y0 + 1.5) * T) / T);
    const free = (y: number) => [cx - 1, cx, cx + 1].every(x => !ctx.terrain.isSolid(x, y));
    while (cy - 2 > y0 && free(cy - 2)) cy--;   // Boss 3 格高：中心往上挪，头顶那一行也得空着
    this.boss = new Boss(ctx.scene, bx, (cy + 0.5) * T, { hp: ctx.cfg.bossHp, hopMs: ctx.cfg.bossHopMs, spitMs: ctx.cfg.bossSpitMs, tile: T });
    this.collider = ctx.scene.physics.add.collider(this.boss, ctx.terrain.layer);
    ctx.fx.fogDirty();
  }

  private end(defeated: boolean): void {
    const { ctx } = this;
    this.collider?.destroy(); this.collider = null;
    if (this.boss) { this.boss.destroy(); this.boss = null; }
    this.doorsPending = [];
    this.armed = false;
    this.cancelIntro();
    this.clearSlime();
    // 开门：封门的格子恢复成原样
    this.doors.forEach(c => ctx.terrain.set(c.x, c.y, ctx.terrain.original[c.y][c.x]));
    this.doors = [];
    this.minions = []; this.lastSpitAt = -Infinity;
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
    ctx.hud.boss({ hp: boss.hp, max: boss.maxHp, name: BOSS_NAME });
    ctx.scene.cameras.main.shake(120, 0.008);
    if (!dead) return;
    this.killMinions();
    this.explode(boss.x, boss.y);
    ctx.fx.flash('msg.bossDefeated', hex(Colors.gold));
    this.end(true);
  }

  private updateBoss(now: number): void {
    if (!this.boss) return;
    const { ctx } = this, boss = this.boss, T = ctx.cfg.tile;
    const room = this.room ?? ctx.rooms.current, T0 = ctx.cfg.tile;
    const arena: Arena = { x0: room.rx * ctx.rooms.pxW + T0, x1: (room.rx + 1) * ctx.rooms.pxW - T0 };
    const ev = boss.step(now, { x: ctx.player.x, y: ctx.player.y }, arena);
    if (ev.flee) this.spitSlime(boss, now);
    if (this.intro) {   // 过场中：只等它落地，不震地形、不伤人
      if (this.intro === 'falling' && ev.landed) this.introLanded(boss);
      return;
    }
    const feet = { x: Math.floor(boss.x / T), y: Math.floor(boss.body.bottom / T) };
    if (ev.heavyLanded) { ctx.scene.cameras.main.shake(260, 0.012); ctx.terrain.shake([feet], 2.5); }
    else if (ev.landed) { ctx.scene.cameras.main.shake(120, 0.005); ctx.terrain.shake([feet], 1.5); }
    if (ev.spit) this.spitMinions(boss, now);
    // 快速下落的碎块砸中 → 扣血，碎块被吞掉
    const rect = boss.rect();
    if (!boss.invulnerable(now)) {
      ctx.terrain.chunks.slice().forEach(ch => {
        if (ch.vy < ctx.cfg.crushMinSpeed || boss.hitBy.has(ch.id)) return;
        let hits = 0;
        ctx.terrain.forEachChunkCell((c, cx, cy, w, h) => { if (c === ch && overlaps(cx, cy, w, h, rect)) hits++; });
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
    if (boss.lethalRects().some(r => Phaser.Geom.Intersects.RectangleToRectangle(r, pr))) ctx.hurt('death.swallowedByBoss', { x: boss.x, y: boss.y });   // 扣一颗心、被弹开
  }

  /** 扑击落地时吐两只小夹子桑：离上次吐至少 bossSpitMs；这个房间里 Boss 吐的、还活着的不超过 bossMaxMinions */
  private spitMinions(boss: Boss, now: number): void {
    const { ctx } = this, cfg = ctx.cfg;
    if (now - this.lastSpitAt < cfg.bossSpitMs) return;
    const room = this.room ?? ctx.rooms.current;
    this.minions = this.minions.filter(e => e.active);
    const alive = this.minions.filter(e => ctx.rooms.same(ctx.rooms.of(e.x, e.y), room)).length;
    const look = { scale: cfg.bossMinionScale };   // 小一号的夹子桑
    let spat = 0;
    for (let i = 0; i < 2 && alive + i < cfg.bossMaxMinions; i++) {
      const e = new Enemy(ctx.scene, { x: boss.x, y: boss.body.top, rx: room.rx, ry: room.ry }, look);
      e.setVelocity((i === 0 ? -1 : 1) * (120 + Math.random() * 80), -260);
      ctx.enemies.add(e);
      this.minions.push(e);
      spat++;
    }
    if (!spat) return;
    this.lastSpitAt = now;
    boss.roar(now, 450);
    ctx.sparks.explode(8, boss.x, boss.body.top);
  }

  // ---------- 黏液 ----------
  /** 吓跑起跳：脚下铺一滩，朝玩家那边甩两团 */
  private spitSlime(boss: Boss, now: number): void {
    const { ctx } = this, T = ctx.cfg.tile;
    this.splat(Math.floor(boss.x / T), Math.floor((boss.body.bottom + 1) / T), now);
    if (!this.blobGroup) {
      this.blobGroup = ctx.scene.physics.add.group();
      ctx.scene.physics.add.collider(this.blobGroup, ctx.terrain.layer);
    }
    const back = Math.sign(ctx.player.x - boss.x) || -Math.sign(boss.body.velocity.x) || 1;   // 朝玩家那边甩
    for (let i = 0; i < 2; i++) {
      const img = this.blobGroup.create(boss.x, boss.body.top + 20, BOSS_TEX.goo) as Phaser.Physics.Arcade.Image;
      img.setScale(2.2).setDepth(9.2).setVelocity(back * (150 + i * 120 + Math.random() * 40), -320 - Math.random() * 120);
      this.blobs.push({ img, until: now + BLOB_TTL_MS });
    }
    ctx.sparks.explode(10, boss.x, boss.body.bottom - 10);
  }

  /** 以 (cx, 这一行地面 row) 为中心铺 3 格黏液：只铺在「这格是地、上面一格空着」的地方 */
  private splat(cx: number, row: number, now: number): void {
    const { ctx } = this, T = ctx.cfg.tile, t = ctx.terrain;
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!t.isSolid(x, row) || t.isSolid(x, row - 1)) continue;
      const key = `${x},${row}`, old = this.slime.get(key);
      if (old) { old.until = now + SLIME_MS; old.img.setAlpha(1); continue; }
      const img = ctx.scene.add.image(x * T, row * T - 6, BOSS_TEX.gooFloor).setOrigin(0, 0).setDepth(3);
      ctx.scene.tweens.add({ targets: img, scaleY: { from: 0.2, to: 1 }, duration: 160, ease: 'Back.out' });
      this.slime.set(key, { img, until: now + SLIME_MS });
    }
  }

  /** 黏液团落地摊开、过期的黏液淡掉；地被炸没了的黏液也跟着没 */
  private updateSlime(now: number): void {
    const { ctx } = this, T = ctx.cfg.tile;
    this.blobs = this.blobs.filter(bl => {
      const b = bl.img.body as Phaser.Physics.Arcade.Body;
      if (b.blocked.down) this.splat(Math.floor(bl.img.x / T), Math.floor((b.bottom + 1) / T), now);
      else if (now < bl.until) return true;
      bl.img.destroy();
      return false;
    });
    this.slime.forEach((s, key) => {
      const [x, y] = key.split(',').map(Number);
      if (now >= s.until || !ctx.terrain.isSolid(x, y)) { s.img.destroy(); this.slime.delete(key); return; }
      if (s.until - now < SLIME_FADE_MS) s.img.setAlpha((s.until - now) / SLIME_FADE_MS);
    });
  }

  private clearSlime(): void {
    this.slime.forEach(s => s.img.destroy()); this.slime.clear();
    this.blobs.forEach(bl => bl.img.destroy()); this.blobs = [];
    this.iceVx = null;
  }

  /**
   * 溜冰：站在黏液上时，这一帧正常移动给的速度（按着 = 满速、松手 = 0）只当成「想往哪走」，
   * 实际速度慢慢往那边靠（ICE_ACCEL）、松手慢慢停（ICE_FRICTION）；撞墙就停。离开黏液、跳起来就恢复正常
   */
  private skate(dt: number): void {
    const { ctx } = this, p = ctx.player, b = p.body, T = ctx.cfg.tile;
    if (!this.slime.size || ctx.dead || !(b.blocked.down || b.touching.down)) { this.iceVx = null; return; }
    const row = Math.floor((b.bottom + 1) / T);
    if (![b.left + 2, b.center.x, b.right - 2].some(x => this.slime.has(`${Math.floor(x / T)},${row}`))) { this.iceVx = null; return; }
    const want = b.velocity.x;
    let v = this.iceVx ?? want;   // 刚踩上来：带着原来的速度
    if ((b.blocked.left && v < 0) || (b.blocked.right && v > 0)) v = 0;
    const rate = want === 0 ? ICE_FRICTION : ICE_ACCEL;
    v += Phaser.Math.Clamp(want - v, -rate * dt, rate * dt);
    p.setVelocityX(v);
    this.iceVx = v;
  }

  /** Boss 倒下的一瞬间：它吐的小夹子桑全部炸掉 */
  private killMinions(): void {
    const { ctx } = this;
    this.minions.forEach(e => { if (!e.active) return; playCrush(ctx.sparks, e.x, e.y); e.destroy(); });
    this.minions = [];
  }

  /** 爆开：碎屑 + 一圈穿墙火花，火花唯一作用是点燃碰到的引线端点 */
  private explode(x: number, y: number): void {
    const { ctx } = this;
    playCrush(ctx.sparks, x, y);
    for (let i = 0; i < 6; i++) ctx.sparks.explode(10, x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.5) * 60);
    this.bursts.push(new SparkBurst(ctx.scene, x, y, ctx.cfg.bossBurstCount, ctx.cfg.bossBurstSpeed, ctx.cfg.tile, ctx.cfg.bossBurstTtl));
    ctx.scene.cameras.main.shake(400, 0.015);
    this.detonateCharges(x, y);
  }

  // ---------- 王之炸药 ----------
  /** Boss 炸开：这个 Boss 房里的王之炸药按离它多远排队，火花圈扩到哪块，哪块就炸 */
  private detonateCharges(x: number, y: number): void {
    const { ctx } = this, T = ctx.cfg.tile, r = ctx.rooms.of(x, y);
    const x0 = r.rx * ctx.rooms.w, y0 = r.ry * ctx.rooms.h;
    for (let cy = y0; cy < y0 + ctx.rooms.h; cy++) for (let cx = x0; cx < x0 + ctx.rooms.w; cx++) {
      if (ctx.terrain.get(cx, cy) !== CHARGE.id) continue;
      const d = Math.hypot((cx + 0.5) * T - x, (cy + 0.5) * T - y);
      this.queueCharge(cx, cy, (d / ctx.cfg.bossBurstSpeed) * 1000);
    }
  }

  private queueCharge(cx: number, cy: number, ms: number): void {
    const t = this.ctx.scene.time.delayedCall(ms, () => { this.chargeTimers = this.chargeTimers.filter(o => o !== t); this.pendingCharges.delete(t); this.blastCharge(cx, cy); });
    this.chargeTimers.push(t); this.pendingCharges.set(t, { cx, cy });
  }

  /**
   * 一块王之炸药炸开：周围 3x3 的实心方块全没（锁着的门、Boss 封门这些防火的不动），挨着的另一块王之炸药排队接着炸，
   * 范围里每一格上的引线（不管是不是端点、什么颜色）都从这里点着，周围会松脱的（脆岩、纸）震下来。不伤人
   */
  private blastCharge(cx: number, cy: number): void {
    const { ctx } = this, t = ctx.terrain, T = ctx.cfg.tile;
    if (t.get(cx, cy) !== CHARGE.id) return;   // 已经炸过了
    const area: CellRef[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) area.push({ x: cx + dx, y: cy + dy });
    const doomed = area.filter(c => {
      const id = t.get(c.x, c.y);
      if (id === CHARGE.id && (c.x !== cx || c.y !== cy)) { this.queueCharge(c.x, c.y, CHARGE_CHAIN_MS); return false; }
      const def = t.def(c.x, c.y);
      return def.solid && (!def.fireproof || id === CHARGE.id);
    });
    t.destroyCellsForce(doomed);
    t.shake([{ x: cx, y: cy }], 1.5);
    const starts: FuseEnd[] = [];
    area.forEach(c => FUSE_CHANNELS.forEach((_, ch) => { if (ctx.fuses.has(c.x, c.y, ch)) starts.push({ x: c.x, y: c.y, ch }); }));
    if (starts.length && ctx.igniteFuses(starts)) ctx.fx.flash('msg.fuseLit', hex(Colors.ember));
    const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
    playCrush(ctx.sparks, px, py);
    ctx.sparks.explode(18, px, py);
    if (ctx.scene.cache.audio.exists('boom')) ctx.scene.sound.play('boom', { volume: 0.7 });
    ctx.scene.cameras.main.shake(180, 0.01);
    ctx.fx.fogDirty();
  }

  private updateBursts(dt: number): void {
    if (!this.bursts.length) return;
    const { ctx } = this;
    let lit = 0;
    this.bursts.forEach(b => b.update(dt, cell => {
      const ends = ctx.fuses.endsAt(cell.x, cell.y);   // 这一格上是端点的那几种颜色（中间段的颜色不点）
      if (!ends.length) return false;
      if (ctx.igniteFuses(ends)) lit++;
      return true;
    }));
    if (lit) ctx.fx.flash('msg.fuseLit', hex(Colors.ember));
    this.bursts = this.bursts.filter(b => b.alive);
  }
}
