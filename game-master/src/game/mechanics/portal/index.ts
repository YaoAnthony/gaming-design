// ===== 通用机制：小城堡（塔门） =====
// 走进城门到下一层（先来一段旋涡）；最后一层没有下一层时，城门才是真结束。
import Phaser from 'phaser';
import type { Point } from '@/type';
import { floorAfter } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';

/** 离门多近（像素）算走进去 */
const ENTER_PX = 24;

class Portals implements Mechanic {
  private portals: Point[] = [];

  constructor(private ctx: PlayContext) {}

  addPortal(p: Point): void {
    this.portals.push(p);
    this.ctx.scene.add.image(p.x, p.y + this.ctx.cfg.tile / 2, 'castle').setOrigin(0.5, 1).setDepth(1.5);
  }

  updateAlive(): void {
    const { ctx } = this, p = ctx.player;
    const portal = this.portals.find(pt => Phaser.Math.Distance.Between(p.x, p.y, pt.x, pt.y) < ENTER_PX);
    if (!portal) return;
    const next = floorAfter(ctx.project, ctx.floor.id);
    if (next) ctx.goToFloor(next.id, portal); else ctx.win(true);
  }
}

const portal = defineMechanic({
  id: 'portal', name: '小城堡', desc: '走进城门到下一层',
  scope: 'global',
  create: ctx => new Portals(ctx),
});

portal.entity({
  id: 'T', name: '小城堡', desc: '走进城门到下一层', texture: 'castle', color: 0x4cc9f0, origin: [0.5, 1],
  spawn: (p, at) => p.addPortal({ x: at.x, y: at.y }),
});
