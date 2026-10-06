// ===== 通用机制：移动方块 =====
// 编辑器「移动方块」画的不是物件，是 model.movers（叠在砖块上的标记）；这一层有标记就启用。
// 种类在 kinds.ts 的 MOVER_KINDS，速度 / 掉头停顿在 config.moverSpeed / moverPauseMs。
import { worldRows } from '@/game/world/WorldModel';
import { layerRows } from '@/game/world/layers';
import { defineMechanic } from '../define';
import { buildMoverGroups, type MoverGroupSpec } from './kinds';
import { Movers } from './Movers';

defineMechanic({
  id: 'mover', name: '移动方块', desc: '画在方块上，相连的一片一起来回移动，任何一格撞到东西就掉头',
  scope: 'global',
  activeOn: floor => Object.values(floor.model.movers ?? {}).some(rows => rows.some(r => /[^.]/.test(r))),
  /** 砖块烘完（文字方块、门）之后再分组：只看能动的砖上面的标记 */
  bake: model => ({ model, data: buildMoverGroups(layerRows(model, 'movers'), worldRows(model)) }),
  create: (ctx, data) => new Movers(ctx, data as MoverGroupSpec[]),
});
