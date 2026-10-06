// 移动方块：按房间存的格子图层，'.' = 无，其它字符 = 哪种移动（kinds.ts 的 MOVER_KINDS）
import { defineGridLayer } from '@/game/world/layers';
import type { WorldModel } from '@/type';
import { moverKind } from './kinds';

function table(m: WorldModel, create: true): Record<string, string[]>;
function table(m: WorldModel, create?: false): Record<string, string[]> | undefined;
function table(m: WorldModel, create = false) { return create ? (m.movers ??= {}) : m.movers; }

export const MOVER_LAYER = defineGridLayer({ id: 'movers', table, accepts: (_m, ch) => !!moverKind(ch) });
