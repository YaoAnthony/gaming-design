// 引线：按房间存的格子图层，每格是颜色位掩码（'.' = 无，见 channels.ts 的 encodeFuse / decodeFuse）
import { defineGridLayer, layerCell, setLayerCell } from '@/game/world/layers';
import type { WorldModel } from '@/type';
import { decodeFuse, encodeFuse, fuseBit } from './channels';

function table(m: WorldModel, create: true): Record<string, string[]>;
function table(m: WorldModel, create?: false): Record<string, string[]> | undefined;
function table(m: WorldModel, create = false) { return create ? (m.fuse ??= {}) : m.fuse; }

export const FUSE_LAYER = defineGridLayer({ id: 'fuse', table });

/** 画 / 擦一格里的某一种颜色的引线，同一格的其它颜色不动 */
export function setFuseCell(m: WorldModel, key: string, x: number, y: number, ch: number, on: boolean): void {
  const cur = decodeFuse(layerCell(m, 'fuse', key, x, y));
  setLayerCell(m, 'fuse', key, x, y, encodeFuse(on ? cur | fuseBit(ch) : cur & ~fuseBit(ch)));
}
