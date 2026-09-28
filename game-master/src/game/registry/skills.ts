// ===== 角色起跳技能的注册 =====
// 想换技能：写一个 defineSkill，然后把 config.skill 改成它的 id（或在游戏页下拉里选）。
import { defineSkill } from './registry';
import type { CellRef } from '@/type';

/** 默认：起跳点圆形爆炸，半径来自 config.explosionRadius */
defineSkill({
  id: 'blast',
  name: '起跳爆炸',
  desc: '每次起跳在起跳点引发固定大小的爆炸（地面留坑，蹬墙削墙）',
  onJump(ctx) {
    const removed = ctx.destroy(ctx.previewRadius(ctx.jump.cell, ctx.cfg.explosionRadius));
    ctx.shake(ctx.jump.cell, ctx.cfg.explosionRadius);
    ctx.fx(ctx.jump.cell, removed, ctx.cfg.explosionRadius);
  },
  preview(ctx, jump) {
    const R = ctx.cfg.explosionRadius;
    return { outline: circle(jump.cell, R), removed: ctx.previewRadius(jump.cell, R), loosened: ctx.previewLoose(jump.cell, R) };
  },
});

/** 示例：定向钻地——地面起跳向下钻 3 格，蹬墙跳向墙里钻 3 格，只有 1 格宽 */
defineSkill({
  id: 'drill',
  name: '定向钻孔',
  desc: '起跳时向下（或向墙内）钻一条 1 格宽、3 格深的孔，不炸旁边',
  onJump(ctx) {
    const cells = drillCells(ctx.jump);
    const removed = ctx.destroy(ctx.previewCells(cells));
    ctx.fx(ctx.jump.cell, removed, 1);
  },
  preview(ctx, jump) {
    const cells = drillCells(jump);
    return { outline: cells, removed: ctx.previewCells(cells) };
  },
});

// ---- 形状工具 ----
function circle(c: CellRef, radius: number): CellRef[] {
  const out: CellRef[] = [];
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= radius * radius) out.push({ x: c.x + dx, y: c.y + dy });
  return out;
}

function drillCells(jump: { kind: 'ground' | 'wall'; cell: CellRef; side?: 1 | -1 }): CellRef[] {
  const { x, y } = jump.cell;
  if (jump.kind === 'ground') return [{ x, y }, { x, y: y + 1 }, { x, y: y + 2 }];
  const dir = jump.side ?? 1;
  return [{ x, y }, { x: x + dir, y }, { x: x + 2 * dir, y }];
}
