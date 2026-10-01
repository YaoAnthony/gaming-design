// ===== 纸（飘落的、被怪物驮着的）的实体：和移动方块一样，每一格都是实心的 =====
// 格子并成横条、一条一个物理体，只在外露的面上碰撞（见 core/solid.ts）：纸是什么形状就是什么形状，
// 竖着的一条从侧面走不进去、贴着它跳也不会在格子接缝上撞头；小船的船舱、船沿都站得住，船舱上方也没有看不见的地板。
// 物理体直接改位置（directControl），物理引擎按位移算速度：站在上面的人、钥匙被带着走。
// 例外：纸正在往下飘、压到人头上时不挡（见 Debris.hitsPlayer），不然人会被夹在纸和地面之间。
import type Phaser from 'phaser';
import type { CellRef } from '@/type';
import { makeSolidBody, settleBody, solidRuns, standsOn, type SolidRun } from '@/game/core/solid';

/** 能驮纸的东西：怪物、玩家。纸贴在它头顶（body.top），横向跟着它的 x 走 */
export type Carrier = Phaser.Physics.Arcade.Sprite & {
  body: Phaser.Physics.Arcade.Body;
  /** 比一格矮的时候按一格高托（怪物）：纸底对齐格线，能从一格高的箱子 / 台阶上面过去；身子往上伸着顶住纸（carryLift） */
  readonly liftsToTile?: boolean;
  /** 纸底比头顶高出多少像素（画面上身子伸长这么多）；没驮 = 0 */
  carryLift?: number;
};

/** 按一格高托的时候，纸底再比格线高这么多（像素）：正好贴着一格高的箱子顶的话，浮点误差会让两者重叠一丝，
 * 物理引擎就会把箱子往旁边挤，一帧挤一点，最后从墙（碎岩）的另一边挤出去 */
const TILE_LINE_GAP = 1;

/** 纸托在哪条线上（纸底的 y，像素）：一般是头顶；liftsToTile 的矮个子按一格高算 */
export function carryLine(c: Carrier, T: number): number {
  const b = c.body;
  return c.liftsToTile ? Math.min(b.top, b.bottom - T - TILE_LINE_GAP) : b.top;
}

export class PaperBody {
  /** 谁驮着它（null = 还在往下飘：压到人头上时不挡；玩家驮着的不挡玩家自己） */
  carriedBy: Carrier | null = null;
  get falling(): boolean { return !this.carriedBy; }
  private parts: { img: Phaser.Physics.Arcade.Image; run: SolidRun }[];
  private placed = false;

  /** @param cells 这块纸的格子（地图坐标，只用相对位置） */
  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, cells: CellRef[], private readonly T: number) {
    const minX = Math.min(...cells.map(c => c.x)), minY = Math.min(...cells.map(c => c.y));
    this.parts = solidRuns(cells.map(c => ({ x: c.x - minX, y: c.y - minY }))).map(run => {
      const img = makeSolidBody(scene, group, run, T);
      img.setData('paper', this);
      return { img, run };
    });
  }

  /** 每一条相对包围盒左上角的像素矩形（用来算会不会把人推进墙） */
  rects(): { x0: number; y0: number; x1: number; y1: number }[] {
    const T = this.T;
    return this.parts.map(({ run }) => ({ x0: run.x * T, y0: run.y * T, x1: (run.x + run.len) * T, y1: (run.y + 1) * T }));
  }

  /** 包围盒左上角摆到 (x, y)（像素） */
  place(x: number, y: number): void {
    const T = this.T;
    this.parts.forEach(({ img, run }) => img.setPosition(x + run.x * T + (run.len * T) / 2, y + run.y * T + T / 2));
    if (this.placed) return;
    this.placed = true;
    this.parts.forEach(({ img }) => settleBody(img));
  }

  /** 这具身体站在纸的某个顶面上吗 */
  carries(b: Phaser.Physics.Arcade.Body): boolean {
    return this.parts.some(({ img, run }) => {
      if (!run.faces.up) return false;
      const p = img.body as Phaser.Physics.Arcade.Body;
      return standsOn(b, p.left, p.right, p.top);
    });
  }

  destroy(): void { this.parts.forEach(({ img }) => img.destroy()); this.parts = []; }
}
