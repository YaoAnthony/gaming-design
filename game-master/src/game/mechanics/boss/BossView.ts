// ===== 史莱姆王的样子：把部件拼起来，按它在干什么动起来 =====
// 物理体（Boss 那个精灵）不变形、不显示，只管碰撞；这里每帧跟着它画：
// - 果冻身体：一根弹簧管「压扁 / 拉长」。起跳前蹲、起跳拉长、空中按速度伸缩、落地啪一下压扁再弹几下，平时轻轻呼吸；
//   左右走的时候往前倾。压扁时变宽、拉长时变窄（体积差不多不变）
// - 眼睛：瞳孔一直盯着玩家，隔几秒眨一下眼；蓄力眯眼、喘气耷拉、挨打紧闭
// - 眉毛：平时皱着；蓄力压得更低更斜；喘气时塌下来
// - 嘴：平时咧着；蓄力、扑过来、吼的时候张大；喘气一张一合；挨打龇牙
// - 王冠：单独一块，比身体慢半拍，落地被颠起来、歪一下再落回头顶
// - 落地溅一圈紫色黏液
// - 被玩家贴得太紧吓到（scared）：一哆嗦、头上冒「!」、眼睛瞪圆、瞳孔缩小、眉毛挑起来、嘴缩成小 O；逃跑（flee）时张嘴尖叫
// 跟着物理精灵的位置、缩放、角度、透明度走（挨打闪烁、换层被吸进旋涡都靠这个）
import Phaser from 'phaser';
import { BOSS_TEX, CROWN, ensureBossTextures } from './bossArt';

/** 它现在在干什么（Boss 每帧给） */
export type BossMood = 'idle' | 'crouch' | 'windup' | 'air' | 'rest' | 'scared' | 'flee';

export interface BossPose {
  mood: BossMood;
  onGround: boolean;
  vx: number;
  vy: number;
  /** 盯着谁看（世界坐标） */
  look: { x: number; y: number };
}

/** 整图里的部件位置（96x96 坐标，脚底在 y=96）→ 相对脚底中点 */
const at = (x: number, y: number) => ({ x: x - 48, y: y - 96 });
const EYES = [at(34, 53), at(62, 53)];
const BROWS = [{ ...at(33, 44), a: 0.4 }, { ...at(63, 44), a: -0.4 }];
const MOUTH = at(48, 73), MOUTH_OPEN = at(48, 71);
/** 王冠底边在整图里的 y（脚底往上多少） */
const CROWN_BOTTOM = CROWN.y + 21 - 96;

/** 身体弹簧：越大越硬、越小越软；阻尼越小越爱来回弹（果冻） */
const SPRING_K = 170, SPRING_C = 7.5;
const CROWN_K = 110, CROWN_C = 6.5;

export class BossView {
  private readonly rig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly eyes: Phaser.GameObjects.Image[];
  private readonly pupils: Phaser.GameObjects.Image[];
  private readonly brows: Phaser.GameObjects.Image[];
  private readonly mouth: Phaser.GameObjects.Image;
  private readonly crown: Phaser.GameObjects.Image;
  private readonly goo: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly alert: Phaser.GameObjects.Image;
  private prevMood: BossMood = 'idle';

  /** 身体的压扁量：> 0 拉长、< 0 压扁 */
  private sq = 0; private sqV = 0;
  private lean = 0;
  private crownDy = 0; private crownV = 0; private crownA = 0; private crownAV = 0;
  private look = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  private wasGround = true;
  private fallVy = 0;
  private nextBlink = 0; private blinkUntil = 0;
  private hurtUntil = 0;
  private roarUntil = 0;

  constructor(scene: Phaser.Scene, private readonly sprite: Phaser.Physics.Arcade.Sprite) {
    ensureBossTextures(scene);
    this.body = scene.add.image(0, 0, BOSS_TEX.body).setOrigin(0.5, 1);
    this.eyes = EYES.map(e => scene.add.image(e.x, e.y, BOSS_TEX.eye));
    this.pupils = EYES.map(e => scene.add.image(e.x, e.y, BOSS_TEX.pupil));
    this.brows = BROWS.map(b => scene.add.image(b.x, b.y, BOSS_TEX.brow).setRotation(b.a));
    this.mouth = scene.add.image(MOUTH.x, MOUTH.y, BOSS_TEX.mouth);
    this.rig = scene.add.container(sprite.x, sprite.y, [this.body, ...this.eyes, ...this.pupils, ...this.brows, this.mouth]).setDepth(9);
    this.crown = scene.add.image(sprite.x, sprite.y, BOSS_TEX.crown).setOrigin(0.5, 1).setDepth(9.1);
    this.goo = scene.add.particles(0, 0, BOSS_TEX.goo, {
      emitting: false, lifespan: { min: 400, max: 650 }, speed: { min: 70, max: 190 }, angle: { min: 195, max: 345 },
      gravityY: 1000, scale: { start: 1.3, end: 0.5 }, alpha: { start: 1, end: 0.6 }, rotate: { min: 0, max: 360 },
      // 沿着身体底边一字排开往两边溅，飞不高，只在脚边
      emitZone: { type: 'random', source: new Phaser.Geom.Line(-42, 0, 42, 0), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(9.2);
    this.alert = scene.add.image(sprite.x, sprite.y, BOSS_TEX.alert).setDepth(9.15).setVisible(false);
    this.nextBlink = scene.time.now + 1500;
  }

  /** 挨打：龇牙闭眼，身子被砸扁一下 */
  hurt(time: number): void { this.hurtUntil = time + 450; this.sqV -= 3.2; this.crownV -= 120; this.crownAV += (Math.random() < 0.5 ? -1 : 1) * 3; }
  /** 张大嘴吼一阵（亮名字、吐小怪） */
  roar(time: number, ms: number): void { this.roarUntil = time + ms; this.sqV += 1.8; }

  update(time: number, dt: number, pose: BossPose): void {
    dt = Math.min(dt, 1 / 20);
    const s = this.sprite, feetX = s.x, feetY = s.y + (s.displayHeight || 96) / 2;
    const hurt = time < this.hurtUntil, roaring = time < this.roarUntil;
    const fright = pose.mood === 'scared' || pose.mood === 'flee';
    if (pose.mood === 'scared' && this.prevMood !== 'scared') { this.sqV += 4.5; this.crownV -= 180; this.crownAV += 4; }   // 吓一跳
    this.prevMood = pose.mood;

    // ---- 落地 / 起跳：给弹簧一下 ----
    if (!pose.onGround) this.fallVy = Math.max(this.fallVy, pose.vy);
    if (pose.onGround && !this.wasGround) {
      const impact = Math.max(0, this.fallVy);
      this.sqV -= Math.min(6.5, impact * 0.0085);
      this.crownV -= Math.min(260, impact * 0.45);
      this.crownAV += (Math.random() - 0.5) * Math.min(6, impact / 90);
      if (impact > 220) this.goo.explode(Math.round(Math.min(26, impact / 26)), feetX, feetY - 6);
      this.fallVy = 0;
    }
    if (!pose.onGround && this.wasGround && pose.vy < -100) this.sqV += 3;   // 起跳：一下子拉长
    this.wasGround = pose.onGround;

    // ---- 身体弹簧：往「现在该有的样子」拉，带过冲 ----
    let target = 0.022 * Math.sin(time / 1000 * 2.6);                               // 呼吸
    if (pose.mood === 'crouch') target = -0.2;                                       // 起跳前蹲一下
    else if (pose.mood === 'windup') target = -0.24 + 0.015 * Math.sin(time / 18);   // 蓄力：压扁、发抖
    else if (pose.mood === 'air' || pose.mood === 'flee') target = Phaser.Math.Clamp(-pose.vy / 1700, -0.1, 0.22);   // 往上冲拉长、往下掉稍微拉长
    else if (pose.mood === 'scared') target = 0.07 + 0.02 * Math.sin(time / 22);                // 吓得绷直、打哆嗦
    else if (pose.mood === 'rest') target = -0.05 + 0.05 * Math.sin(time / 1000 * 9);   // 喘气：一鼓一鼓
    this.sqV += (SPRING_K * (target - this.sq) - SPRING_C * this.sqV) * dt;
    this.sq = Phaser.Math.Clamp(this.sq + this.sqV * dt, -0.36, 0.32);
    const sy = 1 + this.sq, sx = 1 - this.sq * 0.85;
    // 往前倾：在空中按横向速度；地上回正
    const leanTarget = pose.onGround ? 0 : Phaser.Math.Clamp(pose.vx / 1100, -0.16, 0.16);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 8);
    const shake = pose.mood === 'windup' ? (Math.random() - 0.5) * 2.4 : pose.mood === 'scared' ? (Math.random() - 0.5) * 1.6 : 0;

    this.rig.setPosition(feetX + shake, feetY).setScale(sx * s.scaleX, sy * s.scaleY).setRotation(this.lean + s.rotation).setAlpha(s.alpha);
    this.body.setTint(pose.mood === 'windup' ? 0xd8c2ff : 0xffffff);

    // ---- 眼睛：盯着玩家、眨眼、按心情眯起来 ----
    if (time >= this.nextBlink && time >= this.blinkUntil) { this.blinkUntil = time + 110; this.nextBlink = time + 1800 + Math.random() * 2800; }
    const blink = time < this.blinkUntil;
    const open = hurt ? 0.15 : fright ? 1.22 : blink ? 0.12 : pose.mood === 'windup' ? 0.62 : pose.mood === 'rest' ? 0.72 : 1;
    const droop = pose.mood === 'rest' ? 1.5 : 0;
    EYES.forEach((e, i) => {
      const wx = feetX + e.x * sx, wy = feetY + e.y * sy;
      const dx = pose.look.x - wx, dy = pose.look.y - wy, d = Math.hypot(dx, dy) || 1;
      const jitter = fright ? (Math.random() - 0.5) * 1.6 : 0;
      const tx = (dx / d) * 2.6 + jitter, ty = (dy / d) * 2.2 + droop;
      const l = this.look[i];
      l.x += (tx - l.x) * Math.min(1, dt * 12); l.y += (ty - l.y) * Math.min(1, dt * 12);
      this.eyes[i].setScale(fright ? 1.12 : 1, open).setY(e.y + (1 - Math.min(1, open)) * 2.5);
      const pupil = fright ? 0.6 : 1;   // 吓到：瞳孔缩成一点
      this.pupils[i].setPosition(e.x + l.x, e.y + l.y + (1 - Math.min(1, open)) * 2.5).setScale(pupil, pupil * Math.min(1, open * 1.15)).setVisible(open > 0.3);
    });
    // ---- 眉毛 ----
    BROWS.forEach((b, i) => {
      if (fright) { this.brows[i].setRotation(-b.a * 0.6).setY(b.y - 4); return; }   // 挑起来的八字眉
      const angry = hurt || pose.mood === 'windup' || roaring ? 1.5 : pose.mood === 'rest' ? 0.35 : 1;
      const lower = pose.mood === 'windup' || hurt ? 2.5 : pose.mood === 'rest' ? -1.5 : 0;
      this.brows[i].setRotation(b.a * angry).setY(b.y + lower);
    });
    // ---- 嘴 ----
    if (pose.mood === 'scared' && !hurt) this.mouth.setTexture(BOSS_TEX.mouthOpen).setPosition(MOUTH_OPEN.x, MOUTH_OPEN.y + 1).setScale(0.42, 0.5);   // 小 O
    else if (pose.mood === 'flee' && !hurt) this.mouth.setTexture(BOSS_TEX.mouthOpen).setPosition(MOUTH_OPEN.x, MOUTH_OPEN.y).setScale(0.85, 0.95 + 0.1 * Math.sin(time / 30));   // 尖叫
    else if (hurt) this.mouth.setTexture(BOSS_TEX.mouthHurt).setPosition(MOUTH_OPEN.x, MOUTH_OPEN.y).setScale(1);
    else if (roaring || pose.mood === 'windup' || (pose.mood === 'air' && pose.vy < 0 && Math.abs(pose.vx) > 200))
      this.mouth.setTexture(BOSS_TEX.mouthOpen).setPosition(MOUTH_OPEN.x, MOUTH_OPEN.y).setScale(1, roaring ? 0.9 + 0.12 * Math.sin(time / 40) : 1);
    else if (pose.mood === 'rest') this.mouth.setTexture(BOSS_TEX.mouthOpen).setPosition(MOUTH_OPEN.x, MOUTH_OPEN.y + 2).setScale(0.8, 0.45 + 0.35 * Math.abs(Math.sin(time / 1000 * 9)));
    else this.mouth.setTexture(BOSS_TEX.mouth).setPosition(MOUTH.x, MOUTH.y).setScale(1);

    // ---- 王冠：跟着头顶，自己再晃 ----
    this.crownV += (CROWN_K * (0 - this.crownDy) - CROWN_C * this.crownV) * dt;
    this.crownDy = Phaser.Math.Clamp(this.crownDy + this.crownV * dt, -26, 8);
    const crownTilt = this.lean * 1.6 + 0.04 * Math.sin(time / 1000 * 2.6);
    this.crownAV += (60 * (crownTilt - this.crownA) - 5 * this.crownAV) * dt;
    this.crownA += this.crownAV * dt;
    const topY = feetY + CROWN_BOTTOM * sy * s.scaleY;
    this.crown.setPosition(feetX + shake + Math.sin(this.lean) * CROWN_BOTTOM * -sy, topY + this.crownDy)
      .setRotation(this.crownA + s.rotation).setScale(s.scaleX, s.scaleY).setAlpha(s.alpha);
    // 「!」：吓到的那一下在王冠上面蹦出来
    this.alert.setVisible(pose.mood === 'scared').setPosition(feetX + 30, topY - 22 + Math.sin(time / 50) * 2).setScale(1 + 0.15 * Math.abs(Math.sin(time / 70)));
  }

  destroy(): void { this.rig.destroy(); this.crown.destroy(); this.goo.destroy(); this.alert.destroy(); }
}
