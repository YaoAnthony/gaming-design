// 所有 3D 关卡：按 id 取（存档里记的就是 id）
import type { Level3D } from '../level';
import { DESK } from './desk';

const LEVELS: Level3D[] = [DESK];

/** 主角第一次跳出画面时进的关 */
export const FIRST_LEVEL = DESK;

/** 按 id 找关卡；没有这个 id（存档是旧的）就给第一关 */
export const levelById = (id: string | null | undefined): Level3D => LEVELS.find(l => l.id === id) ?? FIRST_LEVEL;
