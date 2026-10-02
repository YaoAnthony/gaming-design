// ===== 骷髅王的骨架（2D）：不再是一张贴图，而是头、身子、两条胳膊分开的一副骨架，能自己动 =====
// 用的是侧面的贴图（skeleton_side.png，脸朝左，对着钢琴和主角）：头和身子是从上面切下来的两块；胳膊是现画的骨头（上臂、前臂、手），手要去哪由外面定，肘在哪按肩和手现算。
// 会的动作：跟着拍子点头、说话时摇头晃脑、举起双手、敲琴键、甩手扔东西、挨打时缩一下。
// 坐标：容器的原点在两脚之间的地面上，x 朝右、y 朝下，单位是贴图像素乘上放大倍数。
import Phaser from 'phaser';
import { Colors } from '@/game/palette';

/** 贴图怎么切：头占上面几行、身子从第几行开始；头和身子叠几行（脖子） */
const CUT = { headRows: 14, bodyFrom: 14, neck: 1 };
/** 用哪张贴图 */
const TEXTURE = 'skeleton_side';
/** 两条胳膊的肩膀在贴图的哪（像素；侧身，两个肩膀几乎叠在一起，都在胸口前面）；上臂、前臂各多长、多粗（贴图像素）；手多大；不干活时手垂在肩膀前面多远、多低 */
const ARM = { shoulders: [[10, 17], [12, 18]], upper: 7, fore: 7, thick: 1.3, hand: 1.9, rest: [3, 11] };
/** 点头：每拍点多少度、头往下沉多少（贴图像素）；说话：摇多少度、多快（毫秒一个来回） */
const HEAD = { nod: 5, dip: 1, talk: 7, talkMs: 170 };
/** 手从一处挪到另一处的快慢（毫秒，越小越跟手） */
const HAND_MS = 70;

const HEAD_FRAME = 'boss-head', BODY_FRAME = 'boss-body';

export class BossRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly head: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly arms: Phaser.GameObjects.Graphics;
  /** 两只手现在在哪、要去哪（容器里的坐标）：0 = 画面左边那只，1 = 右边那只 */
  private readonly hands = [new Phaser.Math.Vector2(), new Phaser.Math.Vector2()];
  private readonly targets = [new Phaser.Math.Vector2(), new Phaser.Math.Vector2()];
  private readonly headY: number;
  private talking = false;
  private lastAt = 0;

  /** @param s 放大几倍 */
  constructor(private readonly scene: Phaser.Scene, x: number, ground: number, private readonly s: number, depth: number) {
    const tex = scene.textures.get(TEXTURE), src = tex.getSourceImage(), w = src.width, h = src.height;
    if (!tex.has(HEAD_FRAME)) { tex.add(HEAD_FRAME, 0, 0, 0, w, CUT.headRows); tex.add(BODY_FRAME, 0, 0, CUT.bodyFrom, w, h - CUT.bodyFrom); }
    this.body = scene.add.image(0, 0, TEXTURE, BODY_FRAME).setOrigin(0.5, 1).setScale(s);
    this.headY = -(h - CUT.bodyFrom - CUT.neck) * s;
    this.head = scene.add.image(0, this.headY, TEXTURE, HEAD_FRAME).setOrigin(0.5, 1).setScale(s);
    this.arms = scene.add.graphics();
    this.root = scene.add.container(x, ground, [this.body, this.arms, this.head]).setDepth(depth);
    this.width = w * s; this.height = h * s;
    for (const i of [0, 1]) { this.targets[i].copy(this.restOf(i)); this.hands[i].copy(this.targets[i]); }
  }

  /** 整个人多宽多高（像素） */
  readonly width: number;
  readonly height: number;

  /** 肩膀在哪（容器里的坐标） */
  private shoulder(i: number): Phaser.Math.Vector2 {
    const [px, py] = ARM.shoulders[i], src = this.scene.textures.get(TEXTURE).getSourceImage();
    return new Phaser.Math.Vector2((px - src.width / 2) * this.s, -(src.height - py) * this.s);
  }

  /** 不干活时这只手垂在哪 */
  restOf(i: number): Phaser.Math.Vector2 {
    const sh = this.shoulder(i);
    return new Phaser.Math.Vector2(sh.x - (ARM.rest[0] + i) * this.s, sh.y + ARM.rest[1] * this.s);   // 脸朝左：两只手都垂在身前
  }

  /** 让这只手去画面上的这个位置（游戏世界的坐标）；null = 垂回身边 */
  reach(i: number, world: { x: number; y: number } | null): void {
    if (world) this.targets[i].set(world.x - this.root.x, world.y - this.root.y); else this.targets[i].copy(this.restOf(i));
  }

  setTalking(on: boolean): void { this.talking = on; }

  /** 挨了一下：头和身子红一下、整个人缩一下再弹回来 */
  flinch(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.setScale(1);
    this.head.setTintFill(Colors.rose); this.body.setTintFill(Colors.rose);
    this.scene.tweens.add({ targets: this.root, scaleX: 1.15, scaleY: 0.85, duration: 70, yoyo: true, onComplete: () => { this.head.clearTint(); this.body.clearTint(); } });
  }

  /** 每帧。beatPhase = 这一拍过了几成（0..1）；没在放曲子给 null（不点头） */
  update(beatPhase: number | null): void {
    const now = this.scene.time.now, dt = Math.min(100, now - this.lastAt);
    this.lastAt = now;
    // 头：说话时摇头晃脑；放曲子时跟着拍子点（拍点上低下去，再抬起来）
    const nod = beatPhase === null ? 0 : Math.exp(-beatPhase * 5);
    const talk = this.talking ? Math.sin(now / HEAD.talkMs * Math.PI * 2) : 0;
    this.head.setAngle(talk * HEAD.talk + nod * HEAD.nod);
    this.head.setY(this.headY + (nod * HEAD.dip + Math.abs(talk) * HEAD.dip) * this.s);
    // 手：往要去的地方靠过去
    const k = 1 - Math.exp(-dt / HAND_MS);
    for (const i of [0, 1]) this.hands[i].lerp(this.targets[i], k);
    this.drawArms();
  }

  /** 两条胳膊：肩 → 肘 → 手，肘往外、往下弯 */
  private drawArms(): void {
    const g = this.arms, s = this.s;
    g.clear();
    for (const i of [0, 1]) {
      const sh = this.shoulder(i), hand = this.hands[i], l1 = ARM.upper * s, l2 = ARM.fore * s;
      const dx = hand.x - sh.x, dy = hand.y - sh.y, d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01) || 0.01;
      // 两根骨头一样长的时候：肘在肩和手连线的中垂线上
      const a = Math.atan2(dy, dx), off = Math.acos(Math.min(1, (d / 2) / l1)) * (dx >= 0 ? 1 : -1);
      const ex = sh.x + Math.cos(a + off) * l1, ey = sh.y + Math.sin(a + off) * l1;
      const hx = sh.x + (dx / (Math.hypot(dx, dy) || 1)) * d, hy = sh.y + (dy / (Math.hypot(dx, dy) || 1)) * d;
      const bone = (x1: number, y1: number, x2: number, y2: number) => {
        g.lineStyle((ARM.thick + 1) * s, Colors.ink, 1); g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(ARM.thick * s, Colors.paper, 1); g.lineBetween(x1, y1, x2, y2);
      };
      bone(sh.x, sh.y, ex, ey); bone(ex, ey, hx, hy);
      g.fillStyle(Colors.ink, 1); g.fillCircle(ex, ey, ARM.thick * s); g.fillCircle(hx, hy, (ARM.hand + 0.5) * s);
      g.fillStyle(Colors.paper, 1); g.fillCircle(ex, ey, ARM.thick * s * 0.7); g.fillCircle(hx, hy, ARM.hand * s);
    }
  }

  destroy(): void { this.scene.tweens.killTweensOf(this.root); this.root.destroy(); }
}
