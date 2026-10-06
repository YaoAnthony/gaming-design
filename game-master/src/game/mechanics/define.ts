// ===== 机制注册表 =====
// 层机制（scope: 'floor'）：决定这一层怎么玩，每层一个，接管玩家移动和按键。平台跳、吃豆人……
// 通用机制（scope: 'global'）：哪一层都能用，默认地图里出现它的物件就自动启用。Boss、钥匙、滑块……
// 新机制 = mechanics/ 下一个文件夹 + mechanics/index.ts 里一行 import，GameScene 不用改。
import type { EntitySpec, Floor, SpawnAt, WorldModel } from '@/type';
import { defineEntity, Entities, Registry } from '@/game/registry/registry';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';

/** 引线烧过的一格。ch = 哪种颜色的引线在烧；导火索类砖块（连锁延迟）烧的没有 ch */
export interface FuseBurnCell { x: number; y: number; ch?: number }

/** 机制实例：每次进层 create 一个新的，离层 destroy。钩子都是可选的 */
export interface Mechanic {
  /** 玩家已经建好、物件都放完之后调用一次（构造时 ctx.player 还不存在） */
  start?(): void;
  /** 每帧都跑（死了、通关画面、换层中也跑）：计时、剧本、动画 */
  update?(now: number, dt: number): void;
  /** 只有活着、没通关、不在换层时才跑：碰撞、拾取、触发。前面的机制可能已经让玩家死了，core 会跳过后面的 */
  updateAlive?(now: number, dt: number): void;
  /** 这个格子额外被挡住吗（比如放下的炸弹） */
  blocks?(cx: number, cy: number): boolean;
  /** 这个格子被机制的实体占着吗（比如箱子）：掉下来的碎块会落在上面，上面的砖算被它撑住 */
  occupies?(cx: number, cy: number): boolean;
  /** 这一格上压着机制的重物（比如移动方块）：压板这类机关把它当成"有东西压上来了" */
  weighs?(cx: number, cy: number): boolean;
  /** 这一格的砖由机制自己画、自己做碰撞（比如正在移动的方块），地形的瓦片层不放它 */
  drawsCell?(cx: number, cy: number): boolean;
  /** 进入新房间（进层时也会对出生房间调用一次） */
  onRoomChanged?(r: { rx: number; ry: number }): void;
  /** 重置前：清掉正在进行的东西（临时物体、还没出场的 Boss） */
  onClear?(): void;
  /**
   * 地形已经复原之后：把自己的状态放回去。room = 按 R，world = 死亡重置整张图，
   * level = 进入下一关（整张图重来、这一关之前打过的都不算，不要重演什么）。返回复活点 = 改玩家的复活位置
   */
  onReset?(scope: 'room' | 'world' | 'level'): { x: number; y: number; vx: number; vy: number } | void;
  /** 死了不重置的模式下（config.deathReset = 'none'）：这次死了还是要重置当前房间吗（比如 Boss 战打到一半：Boss 重新出场） */
  resetsRoomOnDeath?(): boolean;
  /** 引线烧过这些格子 */
  onFuseBurn?(cells: FuseBurnCell[]): void;
  /**
   * 换层、存档时要带走的东西（手上的道具、帽子……）：返回这个机制自己的数据（要能存成 JSON），没有就返回 undefined。
   * 存在 CarryOver[这个机制的 id] 下；进层时用 ctx.carried(id) 拿回来，自己检查对不对
   */
  persist?(): unknown;
  /**
   * 这一刻按键和人归这个机制管（比如节奏关卡开打了）：场景不让人走、不响应跳和 R，机制自己用 ctx.held() 读方向、自己听按键
   */
  takesControl?(): boolean;
  /**
   * 进层时主角先别出场（比如标题画面：骷髅手先搭房间、拍菜单）：场景把人藏着、冻着，等机制调 ctx.enter() 才放出来。
   * 进层时（start 之后）问一次
   */
  delaysEntrance?(): boolean;
  /** 旋涡（进城堡门）时要一起吸进去的东西 */
  vortexTargets?(): Suckable[];
  destroy?(): void;
}

export type { MoveInput } from '@/shared/input';
import type { MoveInput } from '@/shared/input';

/** 层机制额外负责：玩家怎么动、按键做什么 */
export interface FloorMechanic extends Mechanic {
  /** 这一层的重力（不写用 config.gravity） */
  gravity?: number;
  /** 玩家和砖块做物理碰撞吗（俯视层靠格子逻辑走，不碰） */
  collideTerrain: boolean;
  /** 每帧推动玩家。lock = 正在和角色对话，不能左右走 */
  move(input: MoveInput, now: number, lock: boolean): void;
  /** 按下动作键。key：SPACE / UP / W / touch */
  onPress(key: 'SPACE' | 'UP' | 'W' | 'touch', now: number): void;
}

export type ControlsLayout = 'jump' | 'dpad';

interface BaseSpec {
  id: string;
  name: string;
  desc?: string;
  /** 编辑器房间面板里的开关，比如吃豆人的「左右打通」 */
  roomFlags?: { key: string; label: string }[];
  /** 建地形之前改模型：比如把文字方块 / 门烘焙成砖。返回的 data 会传给 create */
  bake?(model: WorldModel): { model: WorldModel; data?: unknown };
}
export interface FloorMechanicSpec<I extends FloorMechanic> extends BaseSpec {
  scope: 'floor';
  /** 手机端按键布局 */
  controls: ControlsLayout;
  /** 旧存档 / 旧地图里的 floor.mode 值，读到就当作这个机制 */
  aliases?: string[];
  /** 这一层有生命值（左上角的心，挨打扣心）；不写 = 没有，碰到就死 */
  hearts?: boolean;
  create(ctx: PlayContext, data: unknown): I;
}
export interface GlobalMechanicSpec<I extends Mechanic> extends BaseSpec {
  scope: 'global';
  /** 不写 = 这一层地图里有它的物件就启用 */
  activeOn?(floor: Floor): boolean;
  create(ctx: PlayContext, data: unknown): I;
}

/** 机制名下的物件：spawn 直接拿到这个机制的实例 */
export type MechanicEntitySpec<I> = Omit<EntitySpec, 'spawn' | 'group' | 'mechanic'> & {
  /** 物品栏分区；不写：层机制用机制名，通用机制归「物件」 */
  group?: string;
  spawn(mech: I, at: SpawnAt): void;
};

export interface MechanicDef<I extends Mechanic = Mechanic> {
  id: string;
  name: string;
  desc: string;
  index: number;
  scope: 'floor' | 'global';
  controls: ControlsLayout;
  aliases: string[];
  /** 层机制：这一层有没有生命值 */
  hearts: boolean;
  roomFlags: { key: string; label: string }[];
  /** 注册在这个机制名下的物件字符 */
  entityIds: string[];
  activeOn(floor: Floor): boolean;
  bake?(model: WorldModel): { model: WorldModel; data?: unknown };
  create(ctx: PlayContext, data: unknown): I;
  /** 在机制名下注册一个物件 */
  entity(spec: MechanicEntitySpec<I>): void;
}

export const Mechanics = new Registry<MechanicDef>('机制', false);

/** 这一层的物件层里有没有这些字符 */
export function floorHasEntities(floor: Floor, ids: string[]): boolean {
  if (!ids.length) return false;
  const set = new Set(ids);
  return Object.values(floor.model.entities ?? {}).some(rows => rows.some(r => [...r].some(ch => set.has(ch))));
}

export function defineMechanic<I extends FloorMechanic>(spec: FloorMechanicSpec<I>): MechanicDef<I>;
export function defineMechanic<I extends Mechanic>(spec: GlobalMechanicSpec<I>): MechanicDef<I>;
export function defineMechanic<I extends Mechanic>(spec: FloorMechanicSpec<I & FloorMechanic> | GlobalMechanicSpec<I>): MechanicDef<I> {
  const def: MechanicDef<I> = {
    id: spec.id,
    name: spec.name,
    desc: spec.desc ?? '',
    index: 0,
    scope: spec.scope,
    controls: spec.scope === 'floor' ? spec.controls : 'jump',
    aliases: spec.scope === 'floor' ? spec.aliases ?? [] : [],
    hearts: spec.scope === 'floor' && !!spec.hearts,
    roomFlags: spec.roomFlags ?? [],
    entityIds: [],
    activeOn: spec.scope === 'global' && spec.activeOn ? spec.activeOn : floor => floorHasEntities(floor, def.entityIds),
    bake: spec.bake,
    create: spec.create as (ctx: PlayContext, data: unknown) => I,
    entity(e) {
      defineEntity({ ...e, group: e.group ?? (def.scope === 'floor' ? def.name : '物件'), mechanic: def.id, spawn: e.spawn as (mech: unknown, at: SpawnAt) => void });
      def.entityIds.push(e.id);
    },
  };
  Mechanics.register(def as unknown as MechanicDef);
  return def;
}

// ---------- 查询 ----------
export const DEFAULT_FLOOR_MECHANIC = 'platform';

export const floorMechanics = (): MechanicDef[] => Mechanics.filter(m => m.scope === 'floor');

/** 这一层用哪个层机制：floor.mode 写了就用它（认旧名）；没写的话，放了哪个层机制的物件就是哪个；都没有 = 平台跳 */
export function floorMechanicOf(floor: Floor): MechanicDef {
  const list = floorMechanics();
  if (floor.mode) {
    const m = list.find(d => d.id === floor.mode || d.aliases.includes(floor.mode!));
    if (m) return m;
  }
  return list.find(d => d.id !== DEFAULT_FLOOR_MECHANIC && floorHasEntities(floor, d.entityIds))
    ?? Mechanics.get(DEFAULT_FLOOR_MECHANIC)!;
}

/** 这一层启用的通用机制（注册顺序 = 每帧 update 顺序） */
export const globalMechanicsOf = (floor: Floor): MechanicDef[] => Mechanics.filter(m => m.scope === 'global' && m.activeOn(floor));

/** 物件字符属于哪个机制（核心物件返回 null） */
export const mechanicOfEntity = (ch: string): string | null => Entities.get(ch)?.mechanic ?? null;
