// ===== 大史莱姆 Boss =====
// 行为循环：游走（离玩家太近就往外跳、太远才靠近）→ 蓄力（压扁变暗，看得出要冲）→ 扑向玩家当时的位置 → 喘气（不动，吐小怪）
// 喘气那一段是玩家把东西砸下来的窗口。只有落石和引线能伤它，受击后有一段无敌。
import Phaser from 'phaser';
import type { Point } from '@/type';

export interface BossOptions { hp: number; hopMs: number; spitMs: number; tile: number }
type Phase = 'wander' | 'windup' | 'charge' | 'rest';

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

  constructor(scene: Phaser.Scene, x: number, y: number, private opts: BossOptions) {
    super(scene, x, y, 'boss');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(88, 84).setOffset(4, 12);
    this.hp = opts.hp; this.maxHp = opts.hp;
    this.hopAt = scene.time.now + 900;
  }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }

  /** 致命判定用的矩形：比物理体收进去一圈，圆角处的空白不算碰到 */
  lethalRect(): Phaser.Geom.Rectangle {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x + 12, b.y + 14, b.width - 24, b.height - 20);
  }
  invulnerable(time: number): boolean { return time < this.hurtUntil; }

  /** 每帧推进状态机；返回事件让场景播特效 / 生怪 */
  step(time: number, target: Point): { landed: boolean; heavyLanded: boolean; spit: boolean } {
    const b = this.body, T = this.opts.tile;
    const onGround = b.blocked.down;
    const landed = onGround && !this.wasOnGround;
    this.wasOnGround = onGround;
    let heavyLanded = false, spit = false;
    const dx = target.x - this.x, dist = Math.abs(dx) / T;

    switch (this.phase) {
      case 'wander':
        if (onGround) {
          this.setVelocityX(0);
          if (time >= this.hopAt) {
            if (this.hopsLeft <= 0) { this.enter('windup', time, 700); break; }
            // 太近往外跳，太远靠近，中间随机
            const dir = dist < 3 ? -Math.sign(dx) || 1 : dist > 8 ? Math.sign(dx) : Math.random() < 0.5 ? -1 : 1;
            this.setVelocity(dir * 130, -420);
            this.setFlipX(dir < 0);
            this.hopsLeft--; this.hopAt = time + this.opts.hopMs;
          }
        }
        break;
      case 'windup':
        this.setVelocityX(0);
        this.setScale(1.12, 0.8);
        this.setTint(0x5a2d8a);
        if (time >= this.phaseUntil && onGround) {
          this.setScale(1, 1); this.clearTint();
          this.chargeDir = Math.sign(dx) || 1;
          const power = Phaser.Math.Clamp(Math.abs(dx) / 0.8, 180, 420);   // 扑向玩家当时的位置
          this.setVelocity(this.chargeDir * power, -560);
          this.setFlipX(this.chargeDir < 0);
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
      case 'rest':
        this.setVelocityX(0);
        if (time >= this.phaseUntil) { this.hopsLeft = 2 + Math.floor(Math.random() * 2); this.hopAt = time + 300; this.enter('wander', time, 0); }
        break;
    }

    if (this.phase !== 'windup') {
      if (time < this.hurtUntil) this.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(time / 60))); else this.setAlpha(1);
    }
    return { landed, heavyLanded, spit };
  }

  private enter(p: Phase, time: number, ms: number): void { this.phase = p; this.phaseUntil = time + ms; }

  /** 扣血；无敌期间无效。返回是否死了 */
  hurt(amount: number, time: number): boolean {
    if (this.invulnerable(time)) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtUntil = time + Boss.INVULN_MS;
    this.scene.tweens.add({ targets: this, scaleX: 1.15, scaleY: 0.85, duration: 90, yoyo: true });
    return this.hp <= 0;
  }
}
