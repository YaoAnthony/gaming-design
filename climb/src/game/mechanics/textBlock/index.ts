// ===== 通用机制：文字方块 =====
// 编辑器里放的一串字，字母由 3×5 像素字体拼成可炸的砖（建地形前 bake 进模型）。
// 这串字的砖全被炸掉，就跳到目标层——标题层的 START / SETTING / QUIT 就是这样做的按钮。
import type { CellRef, TextBlock } from '@/type';
import { bakeTexts } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';

interface Baked { block: TextBlock; cells: CellRef[] }

class TextBlocks implements Mechanic {
  private list: (Baked & { done: boolean })[];

  constructor(private ctx: PlayContext, baked: Baked[]) {
    this.list = baked.filter(b => b.cells.length > 0).map(b => ({ ...b, done: false }));
  }

  updateAlive(): void {
    const grid = this.ctx.terrain.grid;
    const tb = this.list.find(b => !b.done && b.cells.every(c => grid[c.y]?.[c.x] !== b.block.tile));
    if (!tb) return;
    tb.done = true;
    this.ctx.goToFloor(tb.block.target);
  }
}

defineMechanic({
  id: 'textBlock', name: '文字方块', desc: '整串字炸光就跳到目标层',
  scope: 'global',
  activeOn: floor => Object.values(floor.model.texts ?? {}).some(list => list.length > 0),
  bake: model => { const r = bakeTexts(model); return { model: r.model, data: r.blocks }; },
  create: (ctx, data) => new TextBlocks(ctx, data as Baked[]),
});
