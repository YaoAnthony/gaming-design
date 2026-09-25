// ===== 通用机制：终点（假通关） =====
// 到达终点建筑：第 1、2 关是假通关，弹「通关！」弹窗，可以「进入下一关」或 X 关掉继续玩。「进入下一关」其实是
// 画面淡出、地图复原、回到本层出生点，站着长高一阶（1 → 1.5 → 2 格），再玩一次。第 3 关（2 格高）到终点才是真正通关，「再来一次」从起点重开。
import Phaser from 'phaser';
import type { Point } from '@/type';
import { MAX_STAGE } from '@/sprite/Player';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';

/** 离门多近（像素）算到达 */
const REACH_PX = 24;

class Goal implements Mechanic {
  private goal: Point | null = null;
  /** 门现在能触发吗：触发一次之后要等人走远才重新武装 */
  private armed = true;

  constructor(private ctx: PlayContext) {}

  setGoal(p: Point): void {
    this.goal = p;
    this.ctx.scene.add.image(p.x, p.y, 'door').setDepth(2);
    this.drawBuilding(p.x, p.y + this.ctx.cfg.tile / 2);
  }

  updateAlive(): void {
    const { ctx } = this, p = ctx.player;
    if (!this.goal) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y);
    if (!this.armed) { if (d >= REACH_PX * 2) this.armed = true; return; }   // 关掉弹窗继续玩：走远一点门才会再触发
    if (d >= REACH_PX) return;
    this.armed = false;
    // 还没长到最高（第 1、2 关）：假通关，弹窗里可以「进入下一关」；长到最高（第 3 关）：真通关。假通关的门留着，下一关回来再碰
    if (p.stage >= MAX_STAGE) { this.goal = null; ctx.win(true); } else ctx.win(false);
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
  id: 'goal', name: '终点', desc: '第一次到达是假通关：回出生点长成 2 格高再弹通关；第二次到达真通关',
  scope: 'global',
  create: ctx => new Goal(ctx),
});

goal.entity({
  id: 'G', name: '终点', desc: '碰到即通关，上面会画一座建筑', texture: 'door', color: 0xffd166,
  spawn: (g, at) => g.setGoal({ x: at.x, y: at.y }),
});
