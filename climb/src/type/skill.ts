// ===== 角色技能：起跳时发生什么 =====
// 现在只有"起跳点爆炸"，做成注册表是为了将来能换（更大的爆炸、定向钻地、不爆炸……）。
import type { CellRef, GameConfig } from './index';
import type { JumpEvent } from '@/sprite/Player';

/** 技能能拿到的东西：查地形、执行破坏，不直接碰 Phaser */
export interface SkillContext {
  cfg: GameConfig;
  /** 起跳类型与爆炸中心格 */
  jump: JumpEvent;
  /** 圆形范围内会被摧毁的格子（含脆岩连锁） */
  previewRadius(center: CellRef, radius: number): CellRef[];
  /** 任意模板内会被摧毁的格子（含脆岩连锁） */
  previewCells(cells: CellRef[]): CellRef[];
  /** 摧毁这些格子（会触发支撑检测 / 掉落），返回实际摧毁的格子 */
  destroy(cells: CellRef[]): CellRef[];
  /** 半径范围内会松脱掉落的格子（脆岩） */
  previewLoose(center: CellRef, radius: number): CellRef[];
  /** 震动：让半径范围内的脆岩松脱掉落 */
  shake(center: CellRef, radius: number): void;
  /** 播特效：中心 + 被摧毁的格子 + 视觉半径 */
  fx(center: CellRef, removed: CellRef[], radius: number): void;
}

/** 站在地上 / 贴墙时的预览信息 */
export interface SkillPreview {
  /** 画白框的范围 */
  outline: CellRef[];
  /** 会被摧毁的格子 */
  removed: CellRef[];
  /** 会松脱掉落的格子 */
  loosened?: CellRef[];
}

export interface SkillSpec {
  id: string;
  name: string;
  desc?: string;
  /** 起跳时执行 */
  onJump(ctx: SkillContext): void;
  /** 预览：如果现在从这里起跳会怎样 */
  preview(ctx: Omit<SkillContext, 'jump' | 'destroy' | 'fx' | 'shake'>, jump: JumpEvent): SkillPreview;
}

export interface SkillDef extends SkillSpec { desc: string; index: number }
