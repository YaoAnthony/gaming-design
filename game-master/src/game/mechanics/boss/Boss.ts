// ===== 史莱姆王 Boss =====
// 行为循环：游走（每跳一下先蹲一下；离玩家太近就往外跳、太远才靠近）→ 蓄力（压扁发抖、张嘴，看得出要冲）→ 扑向玩家当时的位置 → 喘气（不动，吐小怪）
// 喘气那一段是玩家把东西砸下来的窗口。只有落石和引线能伤它，受击后有一段无敌。
// 玩家老贴着它：每次要跳 / 要扑的时候玩家都在 CLOSE_TILES 以内，连着 2~3 次就被吓到 —— 一哆嗦，然后往房间里离玩家最远的那头
// 大跳过去，起跳时甩出黏液（BossFight 接 flee 事件铺滑地），落地接着正常行动。
// 出场过场（落下、血条涨满、亮名字）期间不动、打不疼，activate 之后才开始这个循环。
// 这个精灵只是物理体：不显示、不变形（碰撞框和致命范围一直是原样）；看得见的果冻身体、眼睛、王冠在 BossView 里，每帧跟着它画。
import Phaser from 'phaser';
import type { Point } from '@/type';
import { BossView, type BossMood } from './BossView';

/** 起跳前先蹲多久（果冻蓄一下力） */
const CROUCH_MS = 170;
/** 玩家离它多近（格）算「贴得太紧」 */
const CLOSE_TILES = 3.5;
/** 吓一跳之后愣多久再逃 */
const SCARED_MS = 550;
/** 跳多高（格）：平时小跳；用力一跃（蓄力扑人）在这两个数之间随机；吓跑那一跳。起跳速度按重力反算（jumpVy） */
const HOP_TILES = 3;
const LEAP_TILES: readonly [number, number] = [4, 5];
const FLEE_TILES = 5;
/** 逃跑落点离房间左右墙多远（像素，Boss 半宽 44 再留点空） */
const FLEE_MARGIN = 60;

export interface BossOptions { hp: number; hopMs: number; spitMs: number; tile: number }
type Phase = 'wander' | 'windup' | 'charge' | 'rest' | 'scared' | 'flee';
/** 它能活动的左右范围（像素，Boss 房的里面） */
export interface Arena { x0: number; x1: number }
export interface BossEvents { landed: boolean; heavyLanded: boolean; spit: boolean; /** 吓得逃跑、刚起跳 */ flee: boolean }

export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  static readonly INVULN_MS = 800;
  /** 已经砸过它的碎块，同一块不重复扣血 */
  readonly hitBy = new Set<number>();

  private phase: Phase = 'wander';
  private phaseUntil = 0;
  private hopsLeft = 3;
  private hopAt = 0;
  private hurtUntil = 0;
  private wasOnGround = false;
  private chargeDir = 1;
  /** 出场过场结束了没有：之前只受重力落下，不跳、不扑、打不疼 */
  private fighting = false;
  /** 蹲下准备起跳：到这个时间就跳（0 = 没在蹲） */
  private crouchUntil = 0;
  private hopDir = 1;
  /** 连着几次行动时玩家都贴得太紧；到 scareAfter 次就被吓到 */
  private closeCount = 0;
  private scareAfter = Boss.rollScare();
  /** 逃跑那一跳的横向速度：在空中一直保持（撞上台子侧面会被物理清零，贴着往上蹭过去再接着飞） */
  private fleeVx = 0;
  private static rollScare(): number { return Math.random() < 0.5 ? 2 : 3; }
  /** 上次盯着的位置（玩家） */
  private lookAt: Point;
  private readonly view: BossView;

  constructor(scene: Phaser.Scene, x: number, y: number, private opts: BossOptions) {
    super(scene, x, y, 'boss');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(88, 84).setOffset(4, 12);
    this.hp = opts.hp; this.maxHp = opts.hp;
    this.hopAt = scene.time.now + 900;
    this.lookAt = { x, y: y + 200 };
    this.setVisible(false);
    this.view = new BossView(scene, this);
  }

  checkpointState() {
    const now = this.scene.time.now;
    return { x: this.x, y: this.y, vx: this.body.velocity.x, vy: this.body.velocity.y, hp: this.hp,
      phase: this.phase, phaseMs: this.phaseUntil - now, hopsLeft: this.hopsLeft, hopMs: this.hopAt - now, hurtMs: this.hurtUntil - now,
      wasOnGround: this.wasOnGround, chargeDir: this.chargeDir, fighting: this.fighting, crouchMs: this.crouchUntil ? this.crouchUntil - now : null,
      hopDir: this.hopDir, closeCount: this.closeCount, scareAfter: this.scareAfter, fleeVx: this.fleeVx, lookAt: { ...this.lookAt } };
  }

  restoreCheckpoint(s: ReturnType<Boss['checkpointState']>): void {
    const now = this.scene.time.now;
    this.body.reset(s.x, s.y); this.setVelocity(s.vx, s.vy); this.hp = s.hp;
    this.phase = s.phase; this.phaseUntil = now + s.phaseMs; this.hopsLeft = s.hopsLeft;
    this.hopAt = now + s.hopMs; this.hurtUntil = now + s.hurtMs; this.wasOnGround = s.wasOnGround;
    this.chargeDir = s.chargeDir; this.fighting = s.fighting; this.crouchUntil = s.crouchMs === null ? 0 : now + s.crouchMs;
    this.hopDir = s.hopDir; this.closeCount = s.closeCount; this.scareAfter = s.scareAfter; this.fleeVx = s.fleeVx; this.lookAt = { ...s.lookAt };
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.active) this.view.update(time, delta / 1000, { mood: this.mood(), onGround: this.body.blocked.down, vx: this.body.velocity.x, vy: this.body.velocity.y, look: this.lookAt });
  }

  /** 画面上它现在是什么样子 */
  private mood(): BossMood {
    if (!this.body.blocked.down) return this.phase === 'flee' ? 'flee' : 'air';
    if (this.phase === 'scared') return 'scared';
    if (this.phase === 'flee') return 'flee';
    if (this.phase === 'windup') return 'windup';
    if (this.phase === 'rest') return 'rest';
    return this.crouchUntil ? 'crouch' : 'idle';
  }

  /** 张大嘴吼一阵（亮名字、吐小怪的时候） */
  roar(time: number, ms: number): void { this.view.roar(time, ms); }

  destroy(fromScene?: boolean): void { this.view?.destroy(); super.destroy(fromScene); }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }

  /**
   * 碰到就死的区域：贴着贴图的圆顶拼五块（顶尖、头顶、肩膀、腰、最宽的下半身，像台阶一样跟着圆顶往外扩），都比画出来的轮廓往里收 4~6 像素，
   * 王冠不算；宁可让玩家擦着边活下来，不要看着没碰到却死了。坐标按物理体（88x84，贴图里 x 4~92、y 12~96）的比例算
   *（画面上的压扁拉长不改物理体，这里一直是原样）
   */
  lethalRects(): Phaser.Geom.Rectangle[] {
    const b = this.body, sx = b.width / 88, sy = b.height / 84;
    const r = (x0: number, y0: number, x1: number, y1: number) => new Phaser.Geom.Rectangle(b.x + x0 * sx, b.y + y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
    return [r(26, 10, 62, 14), r(22, 14, 66, 24), r(12, 24, 76, 32), r(8, 32, 80, 48), r(4, 48, 84, 78)];
  }
  /** 出场过场中、或者刚挨过打：伤不到它 */
  invulnerable(time: number): boolean { return !this.fighting || time < this.hurtUntil; }

  /** 出场过场结束：开始游走、蓄力、扑人 */
  activate(time: number): void {
    this.fighting = true;
    this.phase = 'wander'; this.hopsLeft = 3; this.hopAt = time + 500;
  }

  /** 要行动了（跳 / 扑）：玩家是不是又贴得太紧；连着够次数就该被吓到了 */
  private crowded(dist: number): boolean {
    this.closeCount = dist < CLOSE_TILES ? this.closeCount + 1 : 0;
    return this.closeCount >= this.scareAfter;
  }

  /** 每帧推进状态机；返回事件让场景播特效 / 生怪 / 铺黏液 */
  step(time: number, target: Point, arena: Arena): BossEvents {
    const b = this.body, T = this.opts.tile;
    const onGround = b.blocked.down;
    const landed = onGround && !this.wasOnGround;
    this.wasOnGround = onGround;
    let heavyLanded = false, spit = false, flee = false;
    const dx = target.x - this.x, dist = Math.abs(dx) / T;
    this.lookAt = target;
    if (!this.fighting) { this.setVelocityX(0); return { landed, heavyLanded, spit, flee }; }   // 过场中：只受重力落下

    switch (this.phase) {
      case 'wander':
        if (onGround) {
          this.setVelocityX(0);
          if (time >= this.hopAt) {
            if (!this.crouchUntil && this.crowded(dist)) { this.enter('scared', time, SCARED_MS); break; }
            if (this.hopsLeft <= 0) { this.enter('windup', time, 700); break; }
            if (!this.crouchUntil) {
              // 太近往外跳，太远靠近，中间随机；先蹲一下再跳
              this.hopDir = dist < 3 ? -Math.sign(dx) || 1 : dist > 8 ? Math.sign(dx) : Math.random() < 0.5 ? -1 : 1;
              this.crouchUntil = time + CROUCH_MS;
            } else if (time >= this.crouchUntil) {
              this.crouchUntil = 0;
              this.setVelocity(this.hopDir * 130, -this.jumpVy(HOP_TILES));
              this.hopsLeft--; this.hopAt = time + this.opts.hopMs;
            }
          }
        }
        break;
      case 'windup':
        this.setVelocityX(0);
        if (time >= this.phaseUntil && onGround) {
          this.chargeDir = Math.sign(dx) || 1;
          const vy = this.jumpVy(LEAP_TILES[0] + Math.random() * (LEAP_TILES[1] - LEAP_TILES[0]));   // 用力一跃：4~5 格高
          const g = this.scene.physics.world.gravity.y + b.gravity.y;
          const power = Phaser.Math.Clamp(Math.abs(dx) / ((2 * vy) / Math.max(1, g)), 180, 420);   // 按滞空时间算，正好落到玩家当时的位置
          this.setVelocity(this.chargeDir * power, -vy);
          this.enter('charge', time, 3000);
        }
        break;
      case 'charge':
        if (landed || time >= this.phaseUntil) {
          this.setVelocityX(0);
          heavyLanded = landed;
          spit = true;
          this.enter('rest', time, 1600);
        }
        break;
      case 'scared':
        this.setVelocityX(0);
        if (time >= this.phaseUntil && onGround) {
          // 往房间里离玩家最远的那头跳：按重力算好横向速度，正好落在那边
          const mid = (arena.x0 + arena.x1) / 2;
          const tx = target.x < mid ? arena.x1 - FLEE_MARGIN : arena.x0 + FLEE_MARGIN;
          const g = this.scene.physics.world.gravity.y + b.gravity.y, fleeVy = this.jumpVy(FLEE_TILES);
          const flight = (2 * fleeVy) / Math.max(1, g);
          this.fleeVx = Phaser.Math.Clamp((tx - this.x) / flight, -560, 560);
          this.setVelocity(this.fleeVx, -fleeVy);
          this.closeCount = 0; this.scareAfter = Boss.rollScare();
          flee = true;
          this.enter('flee', time, 4000);
        }
        break;
      case 'flee':
        if (!onGround) this.setVelocityX(this.fleeVx);
        if ((landed && time > this.phaseUntil - 3900) || time >= this.phaseUntil) {
          this.setVelocityX(0);
          this.hopsLeft = 1 + Math.floor(Math.random() * 2); this.hopAt = time + 650;
          this.enter('wander', time, 0);
        }
        break;
      case 'rest':
        this.setVelocityX(0);
        if (time >= this.phaseUntil) { this.hopsLeft = 2 + Math.floor(Math.random() * 2); this.hopAt = time + 300; this.enter('wander', time, 0); }
        break;
    }

    if (time < this.hurtUntil) this.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(time / 60))); else this.setAlpha(1);   // 挨打后闪（画面跟着精灵的透明度）
    return { landed, heavyLanded, spit, flee };
  }

  /**
   * 想跳 tiles 格高要多大的起跳速度（往上为正）。物理是一帧帧走的（每帧先加重力再挪位置），实际到顶比 v²/2g 矮半帧：
   * h = v²/2g - v·dt/2，反过来解 v = g·dt/2 + √((g·dt/2)² + 2gh)
   */
  private jumpVy(tiles: number): number {
    const world = this.scene.physics.world, g = Math.max(1, world.gravity.y + this.body.gravity.y);
    const half = (g / (world.fps || 60)) / 2, h = tiles * this.opts.tile;
    return half + Math.sqrt(half * half + 2 * g * h);
  }

  private enter(p: Phase, time: number, ms: number): void { this.phase = p; this.phaseUntil = time + ms; }

  /** 扣血；无敌期间无效。返回是否死了 */
  hurt(amount: number, time: number): boolean {
    if (this.invulnerable(time)) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtUntil = time + Boss.INVULN_MS;
    this.view.hurt(time);
    return this.hp <= 0;
  }
}
