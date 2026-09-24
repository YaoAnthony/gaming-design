// ===== 通用机制：终点（假通关） =====
// 到达终点建筑只是假通关：彩纸 + 「通关！」，按一下就继续玩，终点不再触发。
import Phaser from 'phaser';
import type { Point } from '@/type';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';

/** 离门多近（像素）算到达 */
const REACH_PX = 24;

class Goal implements Mechanic {
  private goal: Point | null = null;

  constructor(private ctx: PlayContext) {}

  setGoal(p: Point): void {
    this.goal = p;
    this.ctx.scene.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.ctx.cfg.tile / 2);
  }

  updateAlive(): void {
    const p = this.ctx.player;
    if (!this.goal || Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) >= REACH_PX) return;
    this.goal = null;   // 只触发一次
    this.ctx.win(false);
  }

  /** 门后面的一座剪影建筑，亮着窗 */
  private drawBuilding(cx: number, baseY: number): void {
    const T = this.ctx.cfg.tile;
    const g = this.ctx.scene.add.graphics().setDepth(-5);
    g.fillStyle(0x151a2e, 1);
    g.fillRect(cx - 4 * T, baseY - 9 * T, 8 * T, 9 * T);
    g.fillRect(cx - 1.5 * T, baseY - 13 * T, 3 * T, 4 * T);
    g.fillTriangle(cx - 1.5 * T, baseY - 13 * T, cx + 1.5 * T, baseY - 13 * T, cx, baseY - 15.5 * T);
    g.fillStyle(0xffd166, 0.85);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.fillRect(cx - 3 * T + k * 2.5 * T + 8, baseY - 8 * T + r * 2 * T + 6, 20, 28);
    g.fillRect(cx - 10, baseY - 12 * T + 8, 20, 28);
    g.fillStyle(0xffd166, 0.08); g.fillCircle(cx, baseY - 8 * T, 7 * T);
  }
}

const goal = defineMechanic({
  id: 'goal', name: '终点', desc: '到达即假通关，按一下继续玩',
  scope: 'global',
  create: ctx => new Goal(ctx),
});

goal.entity({
  id: 'G', name: '终点', desc: '碰到即通关，上面会画一座建筑', texture: 'door', color: 0xffd166,
  spawn: (g, at) => g.setGoal({ x: at.x, y: at.y }),
});
