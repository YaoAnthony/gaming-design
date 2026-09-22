// ===== 注册表 + 能力特征 =====
// 模式：Registry（注册表）+ Trait 组合（策略 / 特征）。
// 地形、场景、编辑器只通过注册表查询"这个格子有什么能力"，不认识具体砖块字符。
// 新增一种砖块 = 在 tiles.ts 里多写一个 defineTile / defineEntity，其他代码不用改。
import type { Classified, EntityDef, EntitySpec, TileCaps, TileDef, TileSpec, TileTrait } from '@/type';

export class Registry<T extends { id: string; index: number }> {
  private defs = new Map<string, T>();
  private order: T[] = [];

  constructor(private readonly kind: string) {}

  register(def: T): T {
    if (typeof def.id !== 'string' || def.id.length !== 1) throw new Error(`${this.kind}: id 必须是单个字符`);
    if (this.defs.has(def.id)) throw new Error(`${this.kind}: 重复注册 '${def.id}'`);
    def.index = this.order.length;
    this.defs.set(def.id, def);
    this.order.push(def);
    return def;
  }

  has(id: string): boolean { return this.defs.has(id); }
  get(id: string): T | undefined { return this.defs.get(id); }
  list(): T[] { return this.order.slice(); }
  filter(pred: (d: T) => boolean): T[] { return this.order.filter(pred); }
  /** 测试用：清空 */
  clear(): void { this.defs.clear(); this.order = []; }
}

const TILE_CAP_DEFAULTS: TileCaps = {
  solid: false, anchor: false, destructible: false, blastSensitivity: 0, chainCollapse: false, hazard: null,
};

/** 可复用的能力特征 */
export const Traits = {
  Solid: { solid: true } as TileTrait,
  Anchor: { anchor: true } as TileTrait,
  Destructible: (sensitivity = 0): TileTrait => ({ destructible: true, blastSensitivity: sensitivity }),
  Chain: { chainCollapse: true } as TileTrait,
  Hazard: (reason: string): TileTrait => ({ hazard: reason }),
  Hidden: { editorVisible: false } as TileTrait,
};

export const Tiles = new Registry<TileDef>('砖块');
export const Entities = new Registry<EntityDef>('物件');

export function defineTile(spec: TileSpec, ...traits: TileTrait[]): TileDef {
  const caps: TileCaps = Object.assign({}, TILE_CAP_DEFAULTS, ...traits.map(({ editorVisible: _v, ...rest }) => rest));
  const editorVisible = traits.reduce<boolean>((v, t) => (t.editorVisible === undefined ? v : t.editorVisible), spec.editorVisible ?? true);
  const def: TileDef = {
    ...caps,
    id: spec.id,
    name: spec.name,
    desc: spec.desc ?? '',
    color: spec.color,
    frame: spec.frame ?? -1,
    editorVisible,
    canFall: caps.solid && !caps.anchor,
    index: 0,
  };
  if (def.solid && def.frame < 0) throw new Error(`砖块 '${def.id}' 是实心的，必须有图集帧`);
  return Tiles.register(def);
}

export function defineEntity(spec: EntitySpec): EntityDef {
  const def: EntityDef = {
    id: spec.id, name: spec.name, desc: spec.desc ?? '', texture: spec.texture, unique: spec.unique ?? false,
    spawn: spec.spawn, index: 0,
  };
  return Entities.register(def);
}

/** 地图字符归类：砖块 / 物件 / 未知（当空气） */
export function classify(ch: string): Classified {
  const t = Tiles.get(ch);
  if (t) return { kind: 'tile', def: t };
  const e = Entities.get(ch);
  if (e) return { kind: 'entity', def: e };
  return { kind: 'tile', def: Tiles.get('.')! };
}

export const AIR = '.';
