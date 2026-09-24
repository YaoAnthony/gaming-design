// ===== 机制能用的一切 =====
// 机制只通过这里访问场景，不直接碰 GameScene 的字段。GameScene 负责实现它。
import type Phaser from 'phaser';
import type { CellRef, EntryState, Floor, GameConfig, Point, Project, RoomCoord, WorldModel } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseNet } from '@/game/fuse/Fuse';
import type { FogOfWar } from '@/game/fog/Fog';
import type { Music } from '@/game/Music';
import type { Player } from '@/sprite';
import type { SparkEmitter } from '@/particle';
import type { StartGameData } from '@/game/bridge';
import type { Mechanic } from '@/game/mechanics/define';
import type { Dialogue } from './Dialogue';
import type { Debris } from './Debris';
import type { Enemies } from './Enemies';

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
  readonly playtest: boolean;
  /** 复活点：重置时回到这里（Boss 封门时会改它） */
  entry: EntryState;
  /** 统计 */
  stats: { jumps: number; destroyed: number };
  pushStats(): void;

  die(reason: string): void;
  /** final = 真结束；否则是「假通关」，按一下继续玩 */
  win(final: boolean): void;
  /** 换层；给了 via（门的位置）就先来一段旋涡 */
  goToFloor(id: string, via?: Point): void;
  /** 存档（试玩模式下什么都不做） */
  autosave(): void;
  /** 点燃引线端点，返回点燃了几条 */
  igniteFuses(ends: CellRef[]): number;

  fx: {
    flash(text: string, color: string): void;
    popScore(x: number, y: number, n: number): void;
    /** 迷雾要重算（地形 / 光源变了） */
    fogDirty(): void;
  };
  hud: {
    /** null = 不显示分数 */
    score(n: number | null): void;
    boss(v: { hp: number; max: number } | null): void;
  };

  /** 本层启用的另一个机制的实例（没启用就是 undefined） */
  mech<T extends Mechanic>(id: string): T | undefined;
  /** 格子是否被挡：出界、实心砖、或任何机制的 blocks() */
  blocked(cx: number, cy: number): boolean;
  /** 机制额外挡住的格子（不含地形） */
  blockedByMechanics(cx: number, cy: number): boolean;
}
