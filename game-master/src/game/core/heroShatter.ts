// ===== 主角炸碎：白闪一下，然后换成按站姿拆好的碎块（asset 的 HERO_DEBRIS），拼在原地交给物理炸开 =====
// 碎块四溅、撞墙、落地弹几下、滚停后躺平（长条横着躺、头侧躺），在空中死就往下掉，掉进坑就掉没了；
// 胸口一团闪光和烟（hero_boom）。复活时碎块淡出（Respawn.respawn 调 clear）。
import Phaser from 'phaser';
import { HERO_DEBRIS } from '@/asset';
import type { Player } from '@/sprite';
import type { Terrain } from '@/game/terrain/Terrain';
import { DEPTH } from '@/game/depth';
import { Colors } from '@/shared/palette';

const SHATTER = {
  /** 白闪多久才碎（毫秒） */
  flashMs: 70,
  /** 碎块飞出去的速度（px/s）；头往上弹的速度 */
  speed: { min: 150, max: 260 }, headSpeed: 330,
  /** 飞的方向往上带多少（1 = 和水平分量一样大） */
  upBias: 0.9,
  /** 人本来的速度带上多少（跑着死碎块往前甩） */
  carry: 0.3,
  /** 自转（度 / 秒） */
  spin: { min: 360, max: 900 },
  bounce: 0.35,
  /** 贴地时每帧水平速度、自转留多少（摩擦） */
  groundKeep: 0.85, spinKeep: 0.8,
  /** 速度低于这个（px/s）就躺下不动 */
  settleSpeed: 25,
  /** 复活时碎块淡出多久 */
  fadeMs: 350,
};

export class HeroShatter {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly pieces = new Set<Phaser.Physics.Arcade.Sprite>();

  constructor(private readonly scene: Phaser.Scene, terrain: Terrain) {
    this.group = scene.physics.add.group();
    scene.physics.add.collider(this.group, terrain.layer, undefined, terrain.landsOnOneWay);   // 木板上站得住
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this));
  }

  /** 人原地炸开。没有碎块贴图（旧方块主角、单测）就照旧整个人变红 */
  burst(player: Player): void {
    const { scene } = this;
    if (!player.hero || !scene.textures.exists(HERO_DEBRIS.key)) { player.setTint(Colors.rose); return; }
    player.setTintFill(0xffffff);
    scene.time.delayedCall(SHATTER.flashMs, () => {
      player.clearTint();
      player.setVisible(false);   // 帽子、手上的东西跟着人的 visible 一起藏
      this.spawn(player);
    });
  }

  /** 复活：碎块淡出（fade = false 直接收掉） */
  clear(fade = true): void {
    for (const p of this.pieces) {
      this.pieces.delete(p);
      if (!fade) { p.destroy(); continue; }
      if (p.body?.enable) p.disableBody(false, false);
      this.scene.tweens.add({ targets: p, alpha: 0, duration: SHATTER.fadeMs, onComplete: () => p.destroy() });
    }
  }

  private spawn(player: Player): void {
    const { scene } = this;
    const b = player.body, flip = player.flipX ? -1 : 1;
    const sx = Math.abs(player.scaleX), sy = player.scaleY;
    const feetX = b.center.x, feetY = b.bottom;
    const chestX = feetX + HERO_DEBRIS.chest[0] * sx * flip, chestY = feetY + HERO_DEBRIS.chest[1] * sy;
    const vx0 = b.velocity.x * SHATTER.carry, vy0 = b.velocity.y * SHATTER.carry;
    HERO_DEBRIS.pieces.forEach((piece, i) => {
      const x = feetX + piece.x * sx * flip, y = feetY + piece.y * sy;
      const s = scene.physics.add.sprite(x, y, HERO_DEBRIS.key, i) as Phaser.Physics.Arcade.Sprite;
      this.group.add(s);
      s.setScale(sx, sy).setFlipX(flip < 0).setDepth(DEPTH.heroDebris + i * 0.001);   // 表里已经从后往前排好
      const body = s.body as Phaser.Physics.Arcade.Body;
      const side = Math.min(piece.w, piece.h);   // 碰撞框：碎块短边的正方形，转起来也大致贴得住
      body.setSize(side, side, true).setBounce(SHATTER.bounce, SHATTER.bounce);
      let dx = x - chestX, dy = y - chestY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy = dy / len - SHATTER.upBias;
      const n = Math.hypot(dx, dy) || 1;
      let speed = Phaser.Math.Between(SHATTER.speed.min, SHATTER.speed.max);
      if (piece.name === 'face') { dx = Phaser.Math.FloatBetween(-0.15, 0.15); dy = -1; speed = SHATTER.headSpeed; }   // 头往上弹得最高
      else { dx /= n; dy /= n; }
      body.setVelocity(dx * speed + vx0, dy * speed + vy0);
      body.setAngularVelocity(Phaser.Math.Between(SHATTER.spin.min, SHATTER.spin.max) * (Math.random() < 0.5 ? -1 : 1));
      s.setData('piece', piece);
      this.pieces.add(s);
    });
    if (scene.textures.exists('hero_boom')) {
      const fx = scene.add.sprite(chestX, chestY, 'hero_boom').setDepth(DEPTH.heroBoom);
      scene.anims.createFromAseprite('hero_boom', undefined, fx);
      fx.play('hero_boom').once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
  }

  /** 每帧：贴地的减速、慢下来就躺平不动；掉出地图的收掉 */
  private update(): void {
    const bottom = this.scene.physics.world.bounds.bottom + 200;   // 掉进坑、掉出地图
    for (const s of this.pieces) {
      const b = s.body as Phaser.Physics.Arcade.Body;
      if (!b.enable) continue;
      if (s.y > bottom) { this.pieces.delete(s); s.destroy(); continue; }
      if (!b.blocked.down) continue;
      b.velocity.x *= SHATTER.groundKeep;
      b.angularVelocity *= SHATTER.spinKeep;
      if (Math.abs(b.velocity.x) < SHATTER.settleSpeed && Math.abs(b.velocity.y) < SHATTER.settleSpeed * 2) this.settle(s);
    }
  }

  /** 躺平：转到最近的整 90 度（长条横着躺、头侧躺，像素整齐），底边贴地，不再动 */
  private settle(s: Phaser.Physics.Arcade.Sprite): void {
    const b = s.body as Phaser.Physics.Arcade.Body;
    const piece = s.getData('piece') as { name: string; w: number; h: number };
    const ground = b.bottom;
    b.stop();
    s.disableBody(false, false);   // 关掉物理：不然物理体下一帧还会把转角、位置再改一遍
    const tall = piece.h > piece.w * 1.15 || piece.name === 'face';
    const options = tall ? [90, -90] : [0, 180];
    const a = Phaser.Math.Angle.WrapDegrees(s.angle);
    const angle = options.reduce((best, o) => Math.abs(Phaser.Math.Angle.WrapDegrees(a - o)) < Math.abs(Phaser.Math.Angle.WrapDegrees(a - best)) ? o : best);
    s.setAngle(angle);
    const visualH = (Math.abs(angle) === 90 ? piece.w * Math.abs(s.scaleX) : piece.h * s.scaleY);
    s.setPosition(Math.round(s.x), Math.round(ground - visualH / 2));
  }
}
