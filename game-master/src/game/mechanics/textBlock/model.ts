// ===== 文字方块的地图数据：按房间存的一串 TextBlock（不是格子图层，用 defineRoomData 登记删房间 / 清空房间时怎么办）=====
import type { CellRef, TextBlock, WorldModel } from '@/type';
import { cloneModel, positionOf } from '@/game/world/WorldModel';
import { layoutText } from '@/game/world/font';
import { defineRoomData } from '@/game/world/layers';

export const TEXT_DATA = defineRoomData({ id: 'texts', dropRoom: (m, key) => { if (m.texts) delete m.texts[key]; } });

export function addTextBlock(m: WorldModel, key: string, block: TextBlock): void {
  m.texts ??= {};
  (m.texts[key] ??= []).push(block);
}
export function updateTextBlock(m: WorldModel, key: string, id: string, patch: Partial<TextBlock>): void {
  const b = m.texts?.[key]?.find(t => t.id === id);
  if (b) Object.assign(b, patch);
}
export function removeTextBlock(m: WorldModel, key: string, id: string): void {
  if (!m.texts?.[key]) return;
  m.texts[key] = m.texts[key].filter(t => t.id !== id);
}

/** 把所有文字方块烘焙进砖块行（只写到空气格、只写在房间内）；返回烘焙后的模型和每个文字块占的世界格子 */
export function bakeTexts(m: WorldModel): { model: WorldModel; blocks: { block: TextBlock; key: string; cells: CellRef[] }[] } {
  const model = cloneModel(m);
  const blocks: { block: TextBlock; key: string; cells: CellRef[] }[] = [];
  if (!model.texts) return { model, blocks };
  Object.entries(model.texts).forEach(([key, list]) => {
    const pos = positionOf(model, key);
    if (!pos || !model.rooms[key]) return;
    list.forEach(block => {
      const cells: CellRef[] = [];
      layoutText(block.text, block.x, block.y).forEach(c => {
        if (c.x < 0 || c.y < 0 || c.x >= model.roomW || c.y >= model.roomH) return;
        const row = model.rooms[key][c.y];
        if (row[c.x] !== '.') return;
        model.rooms[key][c.y] = row.substring(0, c.x) + block.tile + row.substring(c.x + 1);
        cells.push({ x: pos.rx * model.roomW + c.x, y: pos.ry * model.roomH + c.y });
      });
      blocks.push({ block, key, cells });
    });
  });
  return { model, blocks };
}

