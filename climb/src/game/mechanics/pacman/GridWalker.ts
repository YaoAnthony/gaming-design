// ===== 俯视移动（吃豆人式）：沿格子中线走，想转的方向记住，到路口能转就转；前面是墙就停在格子中央 =====
import type { Player } from '@/sprite';

export type Dir4 = { x: 1 | -1 | 0; y: 1 | -1 | 0 };
export interface Input4 { left: boolean; right: boolean; up: boolean; down: boolean }

export class GridWalker {
  /** 当前走向 / 想转的方向 */
  private dir: Dir4 = { x: 0, y: 0 };
  private want: Dir4 = { x: 0, y: 0 };

  /** @param speed 移动速度（像素/秒），可以随时改（吃豆人 2 阶段吃大力丸会加速） */
  constructor(private player: Player, private T: number, public speed: number) {}

  get heading(): Dir4 { return this.dir; }

  /** 切到俯视：不受重力，碰撞体改成居中的方块，人稍微缩一点好在一格宽的走廊里转弯 */
  attach(): void {
    this.player.body.setAllowGravity(false);
    this.player.setScale(0.8);
    this.player.body.setSize(25, 25, true);
    this.reset();
  }

  reset(): void { this.dir = { x: 0, y: 0 }; this.want = { x: 0, y: 0 }; }

  step(input: Input4, isSolid: (cx: number, cy: number) => boolean): void {
    const p = this.player, T = this.T, b = p.body;
    const cx = b.center.x, cy = b.center.y;
    const gx = Math.floor(cx / T), gy = Math.floor(cy / T);
    const centerX = gx * T + T / 2, centerY = gy * T + T / 2;
    if (input.up) this.want = { x: 0, y: -1 }; else if (input.down) this.want = { x: 0, y: 1 };
    else if (input.left) this.want = { x: -1, y: 0 }; else if (input.right) this.want = { x: 1, y: 0 };
    const canGo = (d: Dir4) => (d.x || d.y) && !isSolid(gx + d.x, gy + d.y);
    const TOL = 6;
    // 转向：想去的方向通、且在垂直方向上离中线够近
    const w = this.want;
    if ((w.x || w.y) && (w.x !== this.dir.x || w.y !== this.dir.y) && canGo(w)) {
      const near = w.x ? Math.abs(cy - centerY) <= TOL : Math.abs(cx - centerX) <= TOL;
      const reverse = w.x === -this.dir.x && w.y === -this.dir.y && (this.dir.x || this.dir.y);
      if (near || reverse) {
        if (!reverse) { if (w.x) p.y += centerY - cy; else p.x += centerX - cx; }
        this.dir = w;
      }
    }
    // 前面是墙：走到格子中央就停
    const d = this.dir;
    if ((d.x || d.y) && !canGo(d)) {
      const past = d.x ? (cx - centerX) * d.x >= 0 : (cy - centerY) * d.y >= 0;
      if (past) { p.x += centerX - cx; p.y += centerY - cy; this.dir = { x: 0, y: 0 }; }
    }
    p.setVelocity(this.dir.x * this.speed, this.dir.y * this.speed);
    if (this.dir.x) p.setFlipX(this.dir.x < 0);
  }
}
