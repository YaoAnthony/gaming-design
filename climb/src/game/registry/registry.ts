// ===== 注册表 + 能力特征 =====
// 模式：Registry（注册表）+ Trait 组合（策略 / 特征）。
// 地形、场景、编辑器只通过注册表查询"这个格子有什么能力"，不认识具体砖块字符。
// 新增一种砖块 = 在 tiles.ts 里多写一个 defineTile / defineEntity，其他代码不用改。
import type { Classified, EntityDef, EntitySpec, SkillDef, SkillSpec, TileCaps, TileDef, TileSpec, TileTrait, ItemDef, ItemSpec } from '@/type';

export class Registry<T extends { id: string; index: number }> {
  private defs = new Map<string, T>();
  private order: T[] = [];

  constructor(private readonly kind: string, private readonly singleChar = true) {}

  register(def: T): T {
    if (typeof def.id !== 'string' || !def.id || (this.singleChar && def.id.length !== 1)) throw new Error(`${this.kind}: id 不合法 '${def.id}'`);
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
  solid: false, anchor: false, destructible: false, blastSensitivity: 0, chainCollapse: false, looseOnBlast: false, floatSpeed: 0, rideable: false, chainDelayMs: 0, igniteAtEndsOnly: false, hazard: null, hazardBox: null, mounted: false,
};

/** 可复用的能力特征 */
export const Traits = {
  Solid: { solid: true } as TileTrait,
  Anchor: { anchor: true } as TileTrait,
  Destructible: (sensitivity = 0): TileTrait => ({ destructible: true, blastSensitivity: sensitivity }),
  Chain: { chainCollapse: true } as TileTrait,
  /** 周围（爆炸范围外再加 sensitivity 格）有爆炸就整块松脱掉落，相连的同类一起掉 */
  Loose: (sensitivity = 1): TileTrait => ({ looseOnBlast: true, blastSensitivity: sensitivity }),
  /** 松脱后慢慢飘下来（像素/秒），飘着的时候能站在上面，落到怪物头上会被驮着走 */
  Float: (speed = 55): TileTrait => ({ floatSpeed: speed, rideable: true }),
  /** 下落时也能站在上面（不一定要飘） */
  Rideable: { rideable: true } as TileTrait,
  /** 连锁沿这种材质传导时，每跳一格延迟 ms 毫秒才摧毁——做出"火苗跑过去"的传导效果 */
  Delay: (ms: number): TileTrait => ({ chainDelayMs: ms }),
  /** 只有链条两端能被点燃，中间段对爆炸免疫（导火索可以穿过危险区而不被误触） */
  EndsOnly: { igniteAtEndsOnly: true } as TileTrait,
  /** 碰到即死；box 是格内真正致命的区域（像素），不给就是整格 */
  Hazard: (reason: string, box?: { x: number; y: number; w: number; h: number }): TileTrait => ({ hazard: reason, hazardBox: box ?? null }),
  Hidden: { editorVisible: false } as TileTrait,
  /** 挂在下面那一格上：下面那格不再是实心（被炸、被烧、掉下去），它就一起碎掉 */
  Mounted: { mounted: true } as TileTrait,
};

export const Tiles = new Registry<TileDef>('砖块');
export const Entities = new Registry<EntityDef>('物件');
export const Skills = new Registry<SkillDef>('技能', false);
export const Items = new Registry<ItemDef>('道具', false);

export function defineSkill(spec: SkillSpec): SkillDef {
  return Skills.register({ ...spec, desc: spec.desc ?? '', index: 0 });
}

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
    autotile: spec.autotile ?? false,
    iconFrame: spec.iconFrame ?? spec.frame ?? -1,
    gameFrame: spec.gameFrame ?? spec.frame ?? -1,
    editorVisible,
    canFall: caps.solid && !caps.anchor,
    index: 0,
  };
  if (def.solid && def.frame < 0) throw new Error(`砖块 '${def.id}' 是实心的，必须有图集帧`);
  return Tiles.register(def);
}

export function defineItem(spec: ItemSpec): ItemDef {
  return Items.register({ ...spec, light: spec.light ?? 0, index: 0 });
}

export function defineEntity(spec: EntitySpec): EntityDef {
  const def: EntityDef = {
    id: spec.id, name: spec.name, desc: spec.desc ?? '', texture: spec.texture, unique: spec.unique ?? false, color: spec.color ?? 0xffffff,
    origin: spec.origin ?? [0.5, 0.5],
    group: spec.group ?? '物件',
    mechanic: spec.mechanic ?? null,
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
