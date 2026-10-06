// 迷雾区：按房间存的格子图层，'1'-'4' = 区号（见 zones.ts）
import { defineGridLayer } from '@/game/world/layers';
import type { WorldModel } from '@/type';

function table(m: WorldModel, create: true): Record<string, string[]>;
function table(m: WorldModel, create?: false): Record<string, string[]> | undefined;
function table(m: WorldModel, create = false) { return create ? (m.fog ??= {}) : m.fog; }

export const FOG_LAYER = defineGridLayer({ id: 'fog', table });
