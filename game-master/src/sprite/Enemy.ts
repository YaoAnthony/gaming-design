// ===== 怪物「夹子桑」：巡逻，遇墙 / 遇悬崖掉头（脚下前方是箱子、纸也算地面，能走上去）；尖刺伤不到它，可以穿过房间边界；
// 看见主角就愣一下、头上冒「!」，然后嘎嘎嘎地冲过去；到了跟前停下来扑过去夹一口；驮纸时用上半截（嘴）夹住纸，只有腿在走 =====
import Phaser from 'phaser';
import type { EnemySpawn } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import { DEPTH } from '@/game/depth';
import { Colors } from '@/shared/palette';
import { clipSees } from './clipSight';

/**
 * 夹子桑的动画（仓库根目录 Aseprite asset/clip.aseprite 导出，前后两层，BootScene 里 load.aseprite）。
 * 每帧 40x40，脚底在第 feetY 行、身体中线在正中，默认朝左。clip = 前层（平时整个人都在这层）；
 * clip_back = 夹纸时被纸挡住的那片夹板和后腿，画在纸后面。动画：clip_walk / clip_attack / clip_carry
 */
export const CLIP = { key: 'clip', back: 'clip_back', feetY: 38, body: { w: 14, h: 28 } } as const;
/**
 * 扑咬：主角和身子横向相距 range 格以内、上下有重叠，就停下来转过去扑咬（驮着纸的时候嘴占着，不咬）；
 * 扑出去那一帧（第 lungeFrame 帧）真的往前冲：lungeSpeed（px/s，前面没地就不冲，不会扑下悬崖）；
 * 咬到的范围 = 身子前面再伸出 reach 格（只在扑出去、夹住那两帧算，动画里的第 biteFrames 帧）；咬完歇 cooldownMs 才能再咬。
 * 合起来：站在 1 格内会被咬到，1.5 格外看到它张嘴就退开能躲掉
 */
export const CLIP_ATTACK = { range: 1.5, reach: 0.6, cooldownMs: 900, biteFrames: [1, 2], lungeFrame: 1, lungeSpeed: 200 };
/**
 * 追人：探查范围 = 横向 sight 格、上下 rows 格（同一层），中间没墙挡着（见 clipSees）。看见了先愣 alertMs（原地蹦一下 hop、头上冒「!」），
 * 再用 speed（px/s）冲过去，腿倒腾得快 animRate 倍；追到悬崖边 / 墙根就站住干瞪着，不会跳下去。
 * 看丢了就跑到最后看见的地方，每 lookMs 左右张望一次，丢了 forgetMs 回去巡逻。嘴里夹着纸的时候只顾驮纸，不追
 */
export const CLIP_CHASE = { sight: 5, rows: 1, alertMs: 350, hop: -150, speed: 150, animRate: 2.2, lookMs: 400, forgetMs: 1800 };
/** 后层画在纸（深度 5，见 terrain/Chunks.ts）后面、地形前面 */
const BACK_DEPTH = 4.9;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  dir: 1 | -1 = -1;
  /** 开始巡逻了没有：所在的房间醒过来才动，醒了之后走到哪都接着动（重置时换成新的怪物，重新睡） */
  awake = false;
  /** 驮纸时按一格高托（比一格矮，纸底对齐格线才能从一格高的箱子上面过去）；嘴尖正好够得着那条线 */
  readonly liftsToTile = true;
  /** 纸底比头顶高出多少像素（CarriedPaper 每帧写）；没驮 = 0。夹子桑比一格矮，驮着纸时总是 > 0 */
  carryLift = 0;
  /** 正在扑咬（播 clip_attack） */
  private biting = false;
  private nextBiteAt = 0;
  /** 夹纸时纸后面那一层（第一次夹纸时才建） */
  private back: Phaser.GameObjects.Sprite | null = null;
  /** 巡逻 / 发现主角愣一下 / 追 */
  private mode: 'patrol' | 'alert' | 'chase' = 'patrol';
  private alertUntil = 0;
  private lastSeenAt = 0;
  /** 最后一次看见主角时主角的中线 x：看丢了就跑到这儿找 */
  private lastSeenX = 0;
  private lookAt = 0;
  /** 头上的「!」（第一次发现主角时才建） */
  private mark: Phaser.GameObjects.Image | null = null;
  /** 这一帧往前走的速度（px/s）：顶着箱子走时箱子用同样的速度滑（PushBlocks），不然追人时会陷进箱子里 */
  speed = 0;

  /** @param look 变体：scale 缩放（Arcade 的碰撞框和偏移会跟着一起缩）。Boss 吐的小夹子用 */
  constructor(scene: Phaser.Scene, readonly spawn: EnemySpawn, look?: { scale?: number }) {
    // 出生点是格子中心：脚底先放在格子底边上面 2 像素，落下去站稳
    super(scene, spawn.x, spawn.y - 4, scene.textures.exists(CLIP.key) ? CLIP.key : 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    if (this.clip) {
      scene.anims.createFromAseprite(CLIP.key, undefined, this);   // 动画建在自己身上，不进全局
      this.play({ key: 'clip_walk', repeat: -1 });
      this.body.setSize(CLIP.body.w, CLIP.body.h, false);
      this.body.setOffset((this.width - CLIP.body.w) / 2, CLIP.feetY - CLIP.body.h);
      // 物理跑完、位置定下来之后再摆后层，不然会差一帧、前后两层对不齐
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncBack, this);
      this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncBack, this));
    } else this.body.setSize(26, 22);
    if (look?.scale) this.setScale(look.scale);
  }

  /** 用的是不是夹子桑的动画（不是就是旧的方块贴图，比如单测） */
  get clip(): boolean { return this.texture.key === CLIP.key; }
  /** 嘴里夹着纸 */
  get carrying(): boolean { return this.carryLift > 0; }
  /** 每帧看一眼主角：看见了 → 愣一下再追；丢了 forgetMs → 回去巡逻。player = null（主角死了 / 不在场）就不追了 */
  watch(player: Phaser.Geom.Rectangle | null, now: number, terrain: Terrain): void {
    if (!this.clip || !player || this.carrying) { this.calmDown(); return; }
    if (clipSees(this.body, player, terrain.T, (x, y) => terrain.isSolid(x, y), CLIP_CHASE.sight, CLIP_CHASE.rows)) {
      this.lastSeenAt = now;
      this.lastSeenX = player.centerX;
      if (this.mode === 'patrol') this.spot(now);
    } else if (this.mode !== 'patrol' && now - this.lastSeenAt > CLIP_CHASE.forgetMs) this.calmDown();
    if (this.mode === 'alert' && now >= this.alertUntil) this.mode = 'chase';
  }

  /** 发现主角：转过去、原地蹦一下、头上冒「!」 */
  private spot(now: number): void {
    this.mode = 'alert';
    this.alertUntil = now + CLIP_CHASE.alertMs;
    this.dir = this.lastSeenX < this.body.center.x ? -1 : 1;
    if (!this.biting) {
      this.setFlipX(this.dir > 0).setVelocityX(0);
      if (this.body.blocked.down) this.setVelocityY(CLIP_CHASE.hop);
    }
    const m = this.mark ??= this.scene.add.image(this.x, this.y, alertTexture(this.scene)).setOrigin(0.5, 1).setDepth(DEPTH.clipAlert);
    this.scene.tweens.killTweensOf(m);
    m.setVisible(true).setAlpha(1).setScale(0.3, 1.8);
    this.scene.tweens.add({ targets: m, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: m, alpha: 0, delay: CLIP_CHASE.alertMs + 250, duration: 200, onComplete: () => m.setVisible(false) });
  }

  private calmDown(): void {
    if (this.mode === 'patrol') return;
    this.mode = 'patrol';
    if (this.mark) { this.scene.tweens.killTweensOf(this.mark); this.mark.setVisible(false); }
  }

  /** 主角在跟前就转过去扑咬（醒着、站在地上、没夹着纸、歇够了才咬） */
  considerBite(player: Phaser.Geom.Rectangle, now: number, T: number): void {
    if (!this.clip || this.biting || now < this.nextBiteAt || this.carrying || !this.body.blocked.down) return;
    const b = this.body;
    const gap = Math.max(player.left - b.right, b.left - player.right);
    if (gap > CLIP_ATTACK.range * T || player.bottom <= b.top || player.top >= b.bottom) return;
    this.biting = true;
    this.anims.timeScale = 1;
    this.dir = player.centerX < b.center.x ? -1 : 1;
    this.setFlipX(this.dir > 0).setVelocityX(0);
    this.play('clip_attack').once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.biting = false;
      this.nextBiteAt = this.scene.time.now + CLIP_ATTACK.cooldownMs;
    });
  }

  /** 咬得到的范围（世界像素）：扑出去、夹住那两帧，身子前面伸出 reach 格；别的时候 null */
  biteRect(T: number): Phaser.Geom.Rectangle | null {
    if (!this.biting) return null;
    const i = (this.anims.currentFrame?.index ?? 0) - 1;
    if (!CLIP_ATTACK.biteFrames.includes(i)) return null;
    const b = this.body, reach = CLIP_ATTACK.reach * T * Math.abs(this.scaleX);
    const x = this.dir > 0 ? b.right : b.left - reach;
    return new Phaser.Geom.Rectangle(x, b.top, reach, b.height * 0.6);   // 嘴在上半截
  }

  /**
   * 巡逻：撞墙或前面没地就掉头。不受房间边界限制，路通就能走到隔壁房间（嘴上夹的纸跟着走）。
   * 扑咬、愣着的时候站住不动；追人见 chase
   */
  step(terrain: Terrain, _roomPxW: number, speed: number, footing: (cx: number, cy: number) => boolean = (x, y) => terrain.isFooting(x, y)): void {
    const b = this.body, T = terrain.T;
    this.speed = 0;
    if (this.biting) {
      const lunge = (this.anims.currentFrame?.index ?? 0) - 1 === CLIP_ATTACK.lungeFrame && this.groundAhead(T, footing);
      this.setVelocityX(lunge ? this.dir * CLIP_ATTACK.lungeSpeed * Math.abs(this.scaleX) : 0);
      return;
    }
    if (this.mode === 'alert') { this.setVelocityX(0); return; }
    if (this.mode === 'chase') { this.chase(T, footing); return; }
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    else if (b.blocked.down && !this.groundAhead(T, footing)) this.dir = this.dir > 0 ? -1 : 1;
    this.speed = speed;
    this.setVelocityX(this.dir * speed);
    this.setFlipX(this.dir > 0);
  }

  /** 朝最后看见主角的地方冲；前面是墙 / 悬崖就站住；到了那儿还没看见就左右张望 */
  private chase(T: number, footing: (cx: number, cy: number) => boolean): void {
    const b = this.body, now = this.scene.time.now, dx = this.lastSeenX - b.center.x;
    if (Math.abs(dx) > 3) {
      this.dir = dx > 0 ? 1 : -1;
      const wall = this.dir > 0 ? b.blocked.right : b.blocked.left;
      if (!wall && (!b.blocked.down || this.groundAhead(T, footing))) this.speed = CLIP_CHASE.speed;
    } else if (this.lastSeenAt < now && now >= this.lookAt) {
      this.dir = this.dir > 0 ? -1 : 1;
      this.lookAt = now + CLIP_CHASE.lookMs;
    }
    this.setVelocityX(this.dir * this.speed);
    this.setFlipX(this.dir > 0);
  }

  /** 脚下前方那一格能不能站（箱子、纸也算） */
  private groundAhead(T: number, footing: (cx: number, cy: number) => boolean): boolean {
    const b = this.body;
    return footing(Math.floor((this.dir > 0 ? b.right + 2 : b.left - 2) / T), Math.floor((b.bottom + 2) / T));
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.clip || this.biting) return;
    // 夹着纸：上半截咬住不动、只有腿在走；没夹：摇摇摆摆地走。站着不动（房间还没醒）就停在第一帧
    const key = this.carrying ? 'clip_carry' : 'clip_walk';
    if (this.anims.currentAnim?.key !== key) this.play({ key, repeat: -1 });
    this.anims.timeScale = this.mode === 'chase' ? CLIP_CHASE.animRate : 1;   // 追人时腿倒腾得飞快
    if (this.body.velocity.x === 0) this.anims.pause(this.anims.currentAnim?.frames[0]);
    else if (this.anims.isPaused) this.anims.resume();
  }

  /** 跟着本体的东西（POST_UPDATE，物理跑完之后）：头上的「!」、夹纸时纸后面那层 */
  private syncBack(): void {
    if (this.mark?.visible) this.mark.setPosition(this.x, this.body.top - 3 * Math.abs(this.scaleY));
    const show = this.active && this.carrying && this.anims.currentAnim?.key === 'clip_carry';
    if (!show) { this.back?.setVisible(false); return; }
    const back = this.back ??= this.scene.add.sprite(this.x, this.y, CLIP.back).setDepth(BACK_DEPTH);
    back.setFrame(this.frame.name).setPosition(this.x, this.y).setFlipX(this.flipX).setScale(this.scaleX, this.scaleY)
      .setAlpha(this.alpha).setAngle(this.angle).setVisible(this.visible);
  }

  destroy(fromScene?: boolean): void {
    this.back?.destroy(); this.back = null;
    this.mark?.destroy(); this.mark = null;
    super.destroy(fromScene);
  }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }
}

/** 「!」的贴图：7x15 像素，金黄描墨边（第一次用到时画一张，整个游戏共用） */
function alertTexture(scene: Phaser.Scene): string {
  const key = 'clip_alert';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(Colors.ink).fillRect(1, 0, 5, 8).fillRect(2, 8, 3, 2).fillRect(1, 11, 5, 4);
  g.fillStyle(Colors.gold).fillRect(2, 1, 3, 6).fillRect(3, 7, 1, 2).fillRect(2, 12, 3, 2);
  g.generateTexture(key, 7, 15);
  g.destroy();
  return key;
}
