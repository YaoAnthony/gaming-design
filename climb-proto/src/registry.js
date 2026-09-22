// ===== 注册表 + 能力特征 =====
// 模式：Registry（注册表）+ Trait 组合（策略/特征）。
// 地形、场景、编辑器都只通过注册表查询“这个格子有什么能力”，不认识具体砖块字符。
// 新增一种砖块 = 在 tiles.js 里多写一个 defineTile / defineEntity，其他代码不用改。

class Registry {
  constructor(kind) { this.kind = kind; this.defs = new Map(); this.order = []; }

  register(def) {
    if (!def || typeof def.id !== 'string' || def.id.length !== 1) throw new Error(`${this.kind}: id 必须是单个字符`);
    if (this.defs.has(def.id)) throw new Error(`${this.kind}: 重复注册 '${def.id}'`);
    def.index = this.order.length;
    this.defs.set(def.id, def);
    this.order.push(def);
    return def;
  }

  has(id) { return this.defs.has(id); }
  get(id) { return this.defs.get(id); }
  list() { return this.order.slice(); }
  filter(pred) { return this.order.filter(pred); }
}

// ---- 砖块能力的默认值：什么都不是（空气）----
const TILE_DEFAULTS = {
  id: null,
  name: '',
  desc: '',
  color: 0xffffff,        // 编辑器/预览用的代表色
  solid: false,           // 实心：挡住玩家、怪物、碎块
  anchor: false,          // 锚点：自身永不掉落，且相连的实心格子都被它撑住
  destructible: false,    // 可被爆炸摧毁
  blastSensitivity: 0,    // 额外感应半径（格）：0 = 只在爆炸范围内才碎；1 = 范围外一圈也会碎
  chainCollapse: false,   // 被波及后沿同类格子连锁崩塌
  hazard: null,           // 非空 = 碰到即死，值是死亡提示
  draw: null,             // (g, x, y, T) 在图集上画自己；空气不画
  editor: { visible: true },
};

// ---- 可复用的能力特征（Trait）----
const Traits = {
  Solid: { solid: true },
  Anchor: { anchor: true },
  Destructible: (sensitivity = 0) => ({ destructible: true, blastSensitivity: sensitivity }),
  Chain: { chainCollapse: true },
  Hazard: (reason) => ({ hazard: reason }),
  Hidden: { editor: { visible: false } },
};

function defineTile(base, ...traits) {
  const def = Object.assign({}, TILE_DEFAULTS, ...traits, base);
  def.editor = Object.assign({}, TILE_DEFAULTS.editor, ...traits.map(t => t.editor || {}), base.editor || {});
  // 派生能力：实心且不是锚点的格子才可能掉落
  def.canFall = def.solid && !def.anchor;
  if (def.solid && !def.draw) throw new Error(`砖块 '${def.id}' 是实心的，必须提供 draw`);
  return Tiles.register(def);
}

// ---- 物件（不是砖块，占一格标记，进游戏时生成成对象）----
const ENTITY_DEFAULTS = {
  id: null, name: '', desc: '', texture: null,
  unique: false,          // 全地图只能有一个（出生点）
  draw: null,             // (g) => ({ w, h })，生成贴图
  spawn: null,            // (scene, wx, wy, cell) 进游戏时调用
};

function defineEntity(base) {
  const def = Object.assign({}, ENTITY_DEFAULTS, base);
  if (!def.draw || !def.spawn) throw new Error(`物件 '${def.id}' 必须提供 draw 和 spawn`);
  def.texture = def.texture || ('entity-' + def.id);
  return Entities.register(def);
}

const Tiles = new Registry('砖块');
const Entities = new Registry('物件');

// 把地图字符归类：砖块 / 物件 / 未知（当空气）
function classify(ch) {
  if (Tiles.has(ch)) return { kind: 'tile', def: Tiles.get(ch) };
  if (Entities.has(ch)) return { kind: 'entity', def: Entities.get(ch) };
  return { kind: 'tile', def: Tiles.get('.') };
}
