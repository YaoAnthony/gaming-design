// ===== 生命值（核心）：几颗心，碰到尖刺 / 怪物 / Boss 扣一颗，扣光才死 =====
// 挨打：人变红一下（hurtFlashMs）、被往伤害来源的反方向弹开（knockbackX / Y，弹开的 knockbackMs 里不听方向键）、
// 左上角少一颗心、人一闪一闪（hurtFlickerMs），从挨打算起 hurtInvulnMs 里无敌。被压、被埋这些还是直接死（ctx.die）。
// 只在平台层开（吃豆人层没有重力，碰到就死，也不显示心）。复活、R、换层都回满。
// 上限 = config.playerHearts + 捡到的胶带加的（addMax，mechanics/tape）。
import type Phaser from 'phaser';
import type { GameConfig, Point } from '@/type';
import type { DeathKey } from '@/i18n/keys';
import type { Player } from '@/sprite';

export interface HealthDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  player: () => Player;
  /** 这一层用不用生命值（平台层用；吃豆人层碰到就死） */
  enabled: boolean;
  /** 现在能不能挨打（死了、复活中、换层中都不行） */
  canHurt: () => boolean;
  die: (reason: DeathKey) => void;
  /** 推给 HUD（null = 不显示） */
  show: (v: { hp: number; max: number } | null) => void;
}

/** 挨打一开始人整个填成的颜色 */
const HURT_TINT = 0xff4d5e;
/** 闪烁时一亮一暗各多久（毫秒） */
const FLICKER_MS = 70;

export class Health {
  hp: number;
  private invulnUntil = 0;
  private flashUntil = 0;
  private flickerUntil = 0;
  private knockUntil = 0;
  private knockVx = 0;
  /** 人身上现在有挨打的效果（变红 / 闪 / 弹开）：结束时要把颜色和透明度还原 */
  private marked = false;
  /** 胶带加的上限 */
  private bonus = 0;

  constructor(private readonly d: HealthDeps) {
    this.hp = d.cfg.playerHearts;
    this.publish();
  }

  get max(): number { return this.d.cfg.playerHearts + this.bonus; }

  /** 上限加 n 颗（胶带），多出来的那几颗是满的 */
  addMax(n: number): void {
    this.bonus += n;
    this.hp = Math.min(this.max, this.hp + n);
    this.publish();
  }
  invulnerable(time: number): boolean { return time < this.invulnUntil; }

  /** 挨一下：from = 伤害从哪来（往反方向弹开）；不给或者正好在脚下 → 往人朝向的反方向弹、主要往上 */
  hurt(reason: DeathKey, from?: Point): void {
    const { d } = this;
    if (!d.enabled) { d.die(reason); return; }
    if (!d.canHurt()) return;
    const now = d.scene.time.now;
    if (now < this.invulnUntil) return;
    this.hp = Math.max(0, this.hp - 1);
    this.publish();
    if (this.hp <= 0) { this.unmark(); d.die(reason); return; }
    const c = d.cfg, p = d.player();
    this.invulnUntil = now + c.hurtInvulnMs;
    this.flashUntil = now + c.hurtFlashMs;
    this.flickerUntil = now + c.hurtFlickerMs;
    this.knockUntil = now + c.knockbackMs;
    const dx = from ? p.x - from.x : 0, sideways = Math.abs(dx) > 4;
    const dir = sideways ? Math.sign(dx) : p.flipX ? 1 : -1;   // flipX = 朝左
    this.knockVx = dir * c.knockbackX * (sideways ? 1 : 0.5);
    p.setVelocity(this.knockVx, -c.knockbackY);
    d.scene.cameras.main.shake(120, 0.006);
    this.marked = true;
    this.update(now);
  }

  /** 每帧，在正常移动之后：弹开期间盖掉方向键给的速度；变红、闪烁 */
  update(time: number): void {
    if (!this.marked) return;
    const p = this.d.player();
    if (time < this.knockUntil) p.setVelocityX(this.knockVx);
    if (time < this.flashUntil) p.setTintFill(HURT_TINT); else p.clearTint();   // 整个人填成红色（用乘法染色的话蓝色的人会变暗而不是变红）
    p.setAlpha(time < this.flickerUntil && Math.floor(time / FLICKER_MS) % 2 ? 0.3 : 1);
    if (time >= this.invulnUntil && time >= this.flickerUntil) this.unmark();
  }

  /** 复活 / 重置：心回满，挨打的效果清掉 */
  reset(): void {
    this.hp = this.max;
    this.invulnUntil = this.flashUntil = this.flickerUntil = this.knockUntil = 0;
    this.unmark();
    this.publish();
  }

  private unmark(): void {
    if (!this.marked) return;
    this.marked = false;
    const p = this.d.player();
    p.clearTint(); p.setAlpha(1);
  }

  private publish(): void { this.d.show(this.d.enabled ? { hp: this.hp, max: this.max } : null); }
}
