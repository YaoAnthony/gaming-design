// ===== 平台跳：左右走、起跳即爆炸（技能注册表决定炸哪里）、爆炸预览 =====
import type Phaser from 'phaser';
import type { GameConfig, SkillContext, SkillDef } from '@/type';
import { Skills } from '@/game/registry/registry';
import { playExplosion } from '@/particle';
import type { JumpEvent } from '@/sprite';
import type { PlayContext } from '@/game/core/PlayContext';
import type { FloorMechanic, MoveInput } from '../define';

export class Platform implements FloorMechanic {
  readonly collideTerrain = true;
  private skill: SkillDef;
  private preview: Phaser.GameObjects.Graphics;

  constructor(private ctx: PlayContext) {
    this.skill = Skills.get(ctx.cfg.skill) ?? Skills.list()[0];
    this.preview = ctx.scene.add.graphics().setDepth(8);
  }

  onPress(_key: string, now: number): void { this.ctx.player.pressJump(now); }

  move(input: MoveInput, now: number, lock: boolean): void {
    const { ctx } = this;
    const lr = { left: !lock && input.left, right: !lock && input.right };
    const jump = ctx.player.step(lr, now);
    if (jump) {
      ctx.stats.jumps += 1;
      this.useSkill(jump);
      ctx.pushStats();
      if (ctx.dialogue.talking) ctx.dialogue.advance();   // 对话中：每跳一次说下一句
    }
    const pv = ctx.player.previewJump(lr);
    this.drawPreview(pv && this.aimJump(pv));
  }

  /** 死了 / 通关 / 换层：预览收起来 */
  update(): void { if (this.ctx.dead || this.ctx.won || this.ctx.leaving) this.drawPreview(null); }

  destroy(): void { this.preview.destroy(); }

  private skillContext(jump: JumpEvent): SkillContext {
    const { ctx } = this;
    return {
      cfg: { ...ctx.cfg, explosionRadius: blastRadius(ctx.cfg, ctx.player.stage) },   // 长大以后炸得更大
      jump,
      previewRadius: (c, r) => ctx.terrain.previewExplosion(c.x, c.y, r),
      previewCells: cells => ctx.terrain.previewCells(cells),
      previewLoose: (c, r) => ctx.terrain.previewLoose([c], r),
      shake: (c, r) => { if (ctx.terrain.shake([c], r)) ctx.fx.fogDirty(); },
      destroy: cells => {
        const removed = ctx.terrain.destroyCells(cells);
        ctx.stats.destroyed += removed.length;
        ctx.fx.fogDirty();
        return removed;
      },
      fx: (center, removed, radius) => playExplosion(ctx.scene, ctx.sparks, ctx.cfg.tile, center, removed, radius),
    };
  }

  /** 定向爆炸：地面起跳时按着方向，爆炸中心往那边挪 */
  private aimJump(jump: JumpEvent): JumpEvent {
    const cfg = this.ctx.cfg;
    if (!cfg.directionalBlast || jump.kind !== 'ground' || !jump.dir) return jump;
    return { ...jump, cell: { x: jump.cell.x + jump.dir * cfg.directionalOffset, y: jump.cell.y } };
  }

  private useSkill(rawJump: JumpEvent): void {
    const { ctx } = this;
    const jump = this.aimJump(rawJump);
    this.skill.onJump(this.skillContext(jump));
    ctx.scene.sound.play('boom', { volume: 0.8 });
    // 爆炸范围里（至少 fuseIgniteRadius）有引线端点就点燃
    const ends = ctx.fuses.endsNear(jump.cell, fuseIgniteRadius(ctx.cfg, ctx.player.stage));
    if (ends.length && ctx.igniteFuses(ends)) ctx.fx.flash('引线点燃！', '#ff7b54');
  }

  private drawPreview(jump: JumpEvent | null): void {
    const { ctx } = this, T = ctx.cfg.tile, g = this.preview, fog = ctx.fog;
    g.clear();
    if (!jump) return;
    const pv = this.skill.preview(this.skillContext(jump), jump);
    const outline = fog ? fog.filterKnown(pv.outline) : pv.outline;
    const removed = fog ? fog.filterKnown(pv.removed) : pv.removed;
    const loosened = fog ? fog.filterKnown(pv.loosened ?? []) : pv.loosened ?? [];
    g.lineStyle(1, 0xffffff, 0.25);
    outline.forEach(c => g.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2));
    removed.forEach(c => {
      const def = ctx.terrain.def(c.x, c.y);
      g.fillStyle(0xffffff, 0.35); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(def.color, 0.6); g.fillRect(c.x * T + 4, c.y * T + 4, T - 8, T - 8);
    });
    // 会松脱掉落的：画个向下的箭头
    loosened.forEach(c => {
      const def = ctx.terrain.def(c.x, c.y);
      g.fillStyle(def.color, 0.3); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(0xffffff, 0.85);
      g.fillTriangle(c.x * T + T / 2 - 6, c.y * T + T / 2 - 4, c.x * T + T / 2 + 6, c.y * T + T / 2 - 4, c.x * T + T / 2, c.y * T + T / 2 + 6);
    });
  }
}

/** 这个长大阶段的起跳爆炸半径（格）：有按阶段单独设的就用它，否则用 explosionRadius */
export function blastRadius(cfg: Pick<GameConfig, 'explosionRadius' | 'explosionRadiusByStage'>, stage: number): number {
  return cfg.explosionRadiusByStage[stage] ?? cfg.explosionRadius;
}

/** 起跳点燃引线的半径（格）：爆炸范围（预览的白框）里的端点都点得着；爆炸比 fuseIgniteRadius 小的时候照旧用 fuseIgniteRadius */
export function fuseIgniteRadius(cfg: Pick<GameConfig, 'explosionRadius' | 'explosionRadiusByStage' | 'fuseIgniteRadius'>, stage: number): number {
  return Math.max(cfg.fuseIgniteRadius, blastRadius(cfg, stage));
}
