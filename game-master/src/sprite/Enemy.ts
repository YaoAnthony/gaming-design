// ===== 怪物：巡逻，遇墙 / 遇悬崖掉头（脚下前方是箱子、纸也算地面，能走上去）；尖刺伤不到它，可以穿过房间边界；驮纸时身子伸到一格高顶着纸 =====
import Phaser from 'phaser';
import type { EnemySpawn } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';

/** 伸长 / 缩回多快（毫秒，越小越快） */
const LIFT_EASE_MS = 70;
/** 每伸长 1 像素身子瘦多少（比例） */
const STRETCH_THIN = 0.008;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  dir: 1 | -1 = -1;
  /** 开始巡逻了没有：所在的房间醒过来才动，醒了之后走到哪都接着动（重置时换成新的怪物，重新睡） */
  awake = false;
  /** 驮纸时按一格高托（比一格矮，纸底对齐格线才能从一格高的箱子上面过去），身子往上伸着顶住纸 */
  readonly liftsToTile = true;
  /** 纸底比头顶高出多少像素（CarriedPaper 每帧写）；没驮 = 0 */
  carryLift = 0;
  /** 画面上现在伸长了多少：往 carryLift 缓过去，有点果冻的弹性 */
  private shownLift = 0;
  /** 伸长时画的那个拉长的身子（碰撞框不变，只是画面；伸着的时候本体藏起来） */
  private stretched: Phaser.GameObjects.Image | null = null;

  /** @param look 变体：texture 换贴图、scale 缩放（Arcade 的碰撞框和偏移会跟着一起缩）。Boss 吐的小史莱姆用 */
  constructor(scene: Phaser.Scene, readonly spawn: EnemySpawn, look?: { texture?: string; scale?: number }) {
    super(scene, spawn.x, spawn.y + 2, look?.texture ?? 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(26, 22);
    if (look?.scale) this.setScale(look.scale);
  }

  /** 巡逻：撞墙或前面没地就掉头。不受房间边界限制，路通就能走到隔壁房间（头上的纸跟着走） */
  step(terrain: Terrain, _roomPxW: number, speed: number, footing: (cx: number, cy: number) => boolean = (x, y) => terrain.isFooting(x, y)): void {
    const b = this.body, T = terrain.T;
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    else if (b.blocked.down) {
      const frontX = Math.floor((this.dir > 0 ? b.right + 2 : b.left - 2) / T);
      const belowY = Math.floor((b.bottom + 2) / T);
      if (!footing(frontX, belowY)) this.dir = this.dir > 0 ? -1 : 1;
    }
    this.setVelocityX(this.dir * speed);
    this.setFlipX(this.dir > 0);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.shownLift += (this.carryLift - this.shownLift) * Math.min(1, delta / LIFT_EASE_MS);
    if (Math.abs(this.carryLift - this.shownLift) < 0.2) this.shownLift = this.carryLift;
    this.drawStretch();
  }

  /** 伸长的身子：脚底不动、往上拉高 shownLift 像素、稍微变瘦一点；别的（朝向、透明度、缩放、旋转）跟着本体 */
  private drawStretch(): void {
    const lift = this.shownLift;
    if (lift <= 0) { this.stretched?.setVisible(false); this.setVisible(true); return; }
    const img = this.stretched ??= this.scene.add.image(0, 0, this.texture.key).setOrigin(0.5, 1);
    const h = this.displayHeight, sy = this.scaleY * (h + lift) / h;
    img.setTexture(this.texture.key).setVisible(true).setDepth(this.depth)
      .setPosition(this.x, this.y + h / 2).setScale(this.scaleX * (1 - lift * STRETCH_THIN), sy)
      .setFlipX(this.flipX).setAlpha(this.alpha).setAngle(this.angle);
    this.setVisible(false);
  }

  destroy(fromScene?: boolean): void { this.stretched?.destroy(); this.stretched = null; super.destroy(fromScene); }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }
}
