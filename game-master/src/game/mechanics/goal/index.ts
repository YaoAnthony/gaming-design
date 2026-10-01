// ===== 通用机制：出口 =====
// 走到出口门：有下一层就是假通关，弹「通关！」弹窗，点「进入下一关」跳到下一层，X 关掉继续玩（走远一点再回来会再弹）；
// 最后一层的出口是真通关，「再来一次」从起点重开。
// （以前假通关是回出生点长高一阶再玩一次；长大的仪式还在 core/Growth.ts，留着以后做成药水之类的道具）
import Phaser from 'phaser';
import type { Point } from '@/type';
import { floorAfter } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';
import { Colors } from '@/game/palette';

/** 离门多近（像素）算到达 */
const REACH_PX = 24;

interface GoalSpot extends Point {
  /** 门现在能触发吗：触发一次之后要等人走远才重新武装 */
  armed: boolean;
  /** 真通关用过了，不再触发 */
  done: boolean;
}

class Goal implements Mechanic {
  /** 一层可以放好几个终点，哪个都算 */
  private goals: GoalSpot[] = [];

  constructor(private ctx: PlayContext) {}

  addGoal(p: Point): void {
    this.goals.push({ x: p.x, y: p.y, armed: true, done: false });
    this.ctx.scene.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.ctx.cfg.tile / 2);
  }

  updateAlive(): void {
    const { ctx } = this, p = ctx.player;
    for (const g of this.goals) {
      if (g.done) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, g.x, g.y);
      if (!g.armed) { if (d >= REACH_PX * 2) g.armed = true; continue; }   // 关掉弹窗继续玩：走远一点门才会再触发
      if (d >= REACH_PX) continue;
      g.armed = false;
      // 有下一层：假通关，弹窗里「进入下一关」跳过去（GameScene.fakeNextLevel）；最后一层：真通关
      if (floorAfter(ctx.project, ctx.floor.id)) ctx.win(false); else { g.done = true; ctx.win(true); }
      return;
    }
  }

  /** 门后面的一座剪影建筑，亮着窗 */
  private drawBuilding(cx: number, baseY: number): void {
    const T = this.ctx.cfg.tile;
    const g = this.ctx.scene.add.graphics().setDepth(-5);
    // 小楼：主楼 4.5 格宽、4.5 格高，上面一座 1.5 格宽的小塔加尖顶；窗 3 列 2 排，塔上一扇
    const win = (x: number, y: number) => g.fillRect(x - 6, y - 8, 12, 16);   // (x, y) = 窗的中心
    g.fillStyle(0x151a2e, 1);
    g.fillRect(cx - 2.25 * T, baseY - 4.5 * T, 4.5 * T, 4.5 * T);
    g.fillRect(cx - 0.75 * T, baseY - 6.5 * T, 1.5 * T, 2 * T);
    g.fillTriangle(cx - 0.75 * T, baseY - 6.5 * T, cx + 0.75 * T, baseY - 6.5 * T, cx, baseY - 7.8 * T);
    g.fillStyle(Colors.gold, 0.85);
    for (const y of [baseY - 3.6 * T, baseY - 2.3 * T]) for (const k of [-1, 0, 1]) win(cx + k * 1.25 * T, y);
    win(cx, baseY - 5.5 * T);
    g.fillStyle(Colors.gold, 0.08); g.fillCircle(cx, baseY - 4 * T, 3.5 * T);
  }
}

const goal = defineMechanic({
  id: 'goal', name: '出口', desc: '到达弹「通关」窗口，点「进入下一关」到下一层；最后一层的出口是真通关',
  scope: 'global',
  create: ctx => new Goal(ctx),
});

goal.entity({
  id: 'G', name: '出口', desc: '碰到弹「通关」窗口，点「进入下一关」到下一层（最后一层是真通关），上面会画一座小楼', texture: 'door', color: Colors.gold,
  spawn: (g, at) => g.addGoal({ x: at.x, y: at.y }),
});
