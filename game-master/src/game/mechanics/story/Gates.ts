// ===== 剧情墙：看着就是岩石，剧情走到某一步（第一幕在庆祝画面上按了「继续」）才塌开 =====
// 地图里画成物件 Y（那一格的砖块层留空）：bake 把它烘成岩石，进层时标记已经有了就直接拆掉。
// 重置房间（R、死亡）会把地形恢复成烘过的样子：onReset 里再拆一次。
import type { CellRef, WorldModel } from '@/type';
import { AIR } from '@/game/registry/registry';
import type { PlayContext } from '@/game/core/PlayContext';
import { STORY } from '@/story/flags';
import { Colors, hex } from '@/shared/palette';

/** 剧情墙的字符 */
export const GATE = 'Y';
/** 烘成什么砖 */
const WALL = 'R';

/** 把地图里的剧情墙烘成岩石；返回这些格子（整层地图上的坐标） */
export function bakeGates(model: WorldModel): { model: WorldModel; data: CellRef[] } {
  const cells: CellRef[] = [];
  const rooms = { ...model.rooms };
  model.layout.forEach((row, ry) => row.forEach((key, rx) => {
    const ents = key ? model.entities?.[key] : undefined;
    if (!key || !ents || !ents.some(r => r.includes(GATE))) return;
    rooms[key] = rooms[key].map((r, y) => [...r].map((c, x) => {
      if (ents[y]?.[x] !== GATE) return c;
      cells.push({ x: rx * model.roomW + x, y: ry * model.roomH + y });
      return WALL;
    }).join(''));
  }));
  return cells.length ? { model: { ...model, rooms }, data: cells } : { model, data: cells };
}

export class Gates {
  constructor(private readonly ctx: PlayContext, private readonly cells: CellRef[]) {}

  get open(): boolean { return this.ctx.story.has(STORY.act1Continued); }

  start(): void {
    if (!this.cells.length) return;
    if (this.open) this.clear(false);
    else this.ctx.story.watch(f => { if (f === STORY.act1Continued) this.clear(true); });
  }

  /** 重置之后地形回到了烘过的样子：墙已经塌了就再拆一次 */
  onReset(): void { if (this.open) this.clear(false); }

  /** 拆掉：fx = 塌的时候震一下、冒烟、提示一句 */
  private clear(fx: boolean): void {
    const { ctx } = this, T = ctx.cfg.tile;
    for (const c of this.cells) {
      if (ctx.terrain.get(c.x, c.y) === AIR) continue;
      ctx.terrain.set(c.x, c.y, AIR);
      if (fx) ctx.sparks.explode(8, c.x * T + T / 2, c.y * T + T / 2);
    }
    ctx.fx.fogDirty();
    if (!fx) return;
    ctx.scene.cameras.main.shake(500, 0.006);
    ctx.fx.flash('msg.wallCollapsed', hex(Colors.gold));
  }
}
