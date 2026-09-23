// ===== 只能从上面站的隐形物理平台：飘落的纸、被驮着的纸都用它 =====
import Phaser from 'phaser';

export class TopPlatform {
  readonly image: Phaser.Physics.Arcade.Image;
  /** 上一帧到这一帧的水平速度（像素/秒），站在上面的人用它跟着走 */
  vx = 0;
  private lastX: number | null = null;

  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, w: number, h: number) {
    this.image = scene.physics.add.image(0, 0, 'spark').setVisible(false);
    const body = this.body;
    body.setSize(w, h);
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    group.add(this.image);
  }

  get body(): Phaser.Physics.Arcade.Body { return this.image.body as Phaser.Physics.Arcade.Body; }

  /** 放到某个包围盒的位置 */
  place(x: number, y: number, w: number, h: number, dt: number): void {
    const cx = x + w / 2, cy = y + h / 2;
    this.vx = this.lastX === null || dt <= 0 ? 0 : (cx - this.lastX) / dt;
    this.lastX = cx;
    this.image.setPosition(cx, cy);
  }

  /** 有人站在上面吗 */
  get ridden(): boolean { return this.body.touching.up; }

  destroy(): void { this.image.destroy(); }
}
