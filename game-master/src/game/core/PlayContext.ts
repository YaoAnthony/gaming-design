// ===== 机制能用的一切 =====
// 机制只通过这里访问场景，不直接碰 GameScene 的字段。GameScene 负责实现它。
import type Phaser from 'phaser';
import type { EntryState, Floor, GameConfig, Point, Project, RoomCoord, WorldModel } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseEnd, FuseNet } from '@/game/fuse/Fuse';
import type { FogOfWar } from '@/game/fog/Fog';
import type { Music } from '@/game/Music';
import type { Player } from '@/sprite';
import type { SparkEmitter } from '@/particle';
import type { StartGameData } from '@/protocol';
import type { Mechanic, MoveInput } from '@/game/mechanics/define';
import type { Solids } from './solids';
import type { DeathKey, MsgKey } from '@/i18n/keys';
import type { Dialogue } from './Dialogue';
import type { Debris } from './Debris';
import type { Enemies } from './Enemies';
import type { LightKind } from './sceneFx';

/** 旋涡能吸走的东西：有位置、缩放、透明度 */
export type Suckable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle;

export interface RoomApi {
  /** 玩家当前所在的房间 */
  readonly current: RoomCoord;
  /** 房间尺寸（格 / 像素） */
  readonly w: number;
  readonly h: number;
  readonly pxW: number;
  readonly pxH: number;
  of(x: number, y: number): RoomCoord;
  same(a: RoomCoord, b: RoomCoord): boolean;
  key(r: RoomCoord): string | null;
  /** 房间开关（roomFlags[房间].xxx） */
  flag(r: RoomCoord, flag: string): boolean;
  /** 在房间里找一个能站的位置 */
  standingSpot(r: RoomCoord): Point;
  /** 立刻 / 平移镜头到这个房间 */
  enter(r: RoomCoord, instant: boolean): void;
  /** 这个房间醒着吗（玩家这一局进过）：没醒的房间里，会自己动的东西原地等着 */
  isAwake(r: RoomCoord): boolean;
}

export interface PlayContext {
  scene: Phaser.Scene;
  cfg: GameConfig;
  project: Project;
  floor: Floor;
  /** 当前层模型（已经过各机制的 bake，比如文字方块、门已烘成砖） */
  model: WorldModel;
  /** 进层时带进来的数据（读档 / 换层） */
  start: StartGameData;
  /** 这个机制带进这一层的东西（上一层 / 存档里它 persist 交出来的）；没有是 undefined。拿到之后自己检查对不对 */
  carried(mechanicId: string): unknown;
  terrain: Terrain;
  fuses: FuseNet;
  fog: FogOfWar | null;
  /** start() 之后才有 */
  player: Player;
  enemies: Enemies;
  debris: Debris;
  sparks: SparkEmitter;
  music: Music;
  /** 对话服务：NPC（按键翻一句）和剧情（按 autoMs 自动翻页）共用一个对话框 */
  dialogue: Dialogue;
  rooms: RoomApi;

  /** 玩家状态 */
  readonly dead: boolean;
  readonly won: boolean;
  readonly leaving: boolean;
  /** 正在出场（骷髅手把人放进来）：人还不在自己手里，别按玩家位置触发东西 */
  readonly appearing: boolean;
  readonly playtest: boolean;
  /** 人被别的事占着（死了、通关画面、换层、长大、出场、在 3D 世界、攥纸团）：这时候别开新的演出 */
  readonly busy: boolean;
  /** 人跳出画面去了 3D 世界 */
  readonly away: boolean;
  /** 让人从画面的这个位置跳出去（去 3D 世界） */
  popOut(from: Point): void;
  /** 现在按着哪些方向（键盘、手柄、触屏合起来）：接管按键的机制（节奏关卡）自己读 */
  held(): MoveInput;
  /** 复活点：重置时回到这里（Boss 封门时会改它） */
  entry: EntryState;
  /** 统计 */
  stats: { jumps: number; destroyed: number };
  pushStats(): void;
  /** 玩家设置的实时值（cfg 是进层时的快照）和改设置：滑块用 */
  settings: {
    config(): GameConfig;
    setConfig(patch: Partial<GameConfig>): void;
  };

  die(reason: DeathKey): void;
  /** 挨一下：扣一颗心、被往 from 的反方向弹开；心扣光才死（没开生命值的层直接死）。被压、被埋这种用 die */
  hurt(reason: DeathKey, from?: Point): void;
  /** final = 真结束；否则是「假通关」，按一下继续玩 */
  win(final: boolean): void;
  /** 换层；给了 via（门的位置）就先来一段旋涡 */
  goToFloor(id: string, via?: Point): void;
  /** 点燃引线端点（带颜色：只沿这种颜色烧），返回会烧到几格；0 = 什么都没点着 */
  igniteFuses(ends: FuseEnd[]): number;

  fx: {
    /** text 是 i18n key（msg.* / rhythm.* …），params 填进 {{…}} */
    flash(text: MsgKey | `rhythm.${string}`, color: string, params?: Record<string, unknown>): void;
    popScore(x: number, y: number, n: number): void;
    /** 迷雾要重算（地形 / 光源变了） */
    fogDirty(): void;
    /** 在 (x, y) 放一盏暖光（蜡烛等）；画面效果关了返回 null。返回的图片由调用方挪动、销毁 */
    light(x: number, y: number, kind: LightKind): Phaser.GameObjects.Image | null;
  };
  hud: {
    /** null = 不显示分数 */
    score(n: number | null): void;
    /** per = 一管多少滴（血多时分成好几管） */
    boss(v: { hp: number; max: number; per?: number } | null): void;
    /** Boss 出场过场叠在画面上的那一段（WARNING / 名字），null = 收起 */
    bossIntro(v: 'warning' | 'title' | null): void;
    /** 换一套心（节奏关卡：两滴一格的金心）；null = 换回这一层平时的心 */
    hearts(v: { hp: number; max: number; tiered?: boolean } | null): void;
    /** 节奏关卡：这一下的判定和连击（null = 收起）；现在是哪种玩法（底下的按键提示跟着换） */
    rhythm(v: { combo: number; judge: 'perfect' | 'good' | 'miss' | null } | null): void;
    rhythmMode(mode: string): void;
    /** 整个画面闪一下白光（破屏） */
    whiteout(): void;
  };

  /** 本层启用的另一个机制的实例（没启用就是 undefined） */
  mech<T extends Mechanic>(id: string): T | undefined;
  /** 格子是否被挡：出界、实心砖、或任何机制的 blocks() */
  blocked(cx: number, cy: number): boolean;
  /** 机制额外挡住的格子（不含地形） */
  blockedByMechanics(cx: number, cy: number): boolean;
  /** 格子被机制的实体占着（比如箱子） */
  occupied(cx: number, cy: number): boolean;
  /** 格子上压着机制的重物（比如移动方块），见 Mechanic.weighs */
  weighs(cx: number, cy: number): boolean;
  /** 这具身体站在会动的东西（移动方块、纸）上的话，那东西这一帧横着挪了多少像素；没站在上面 = 0 */
  platformShift(b: Phaser.Physics.Arcade.Body): number;
  /** 实心体登记：会动的实心地形（移动方块、纸）和要站在它们上面的东西（箱子、钥匙）都登记在这，碰撞器统一挂 */
  solids: Solids;
}
