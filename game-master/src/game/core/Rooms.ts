// ===== 房间：坐标换算、当前房间、进房间时镜头和迷雾跟过去 =====
// 画布 = 一个房间；每层房间尺寸可以不同。机制通过 PlayContext.rooms 用它
import type Phaser from 'phaser';
import type { GameConfig, RoomCoord, WorldModel } from '@/type';
import type { RoomApi } from './PlayContext';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FogOfWar } from '@/game/fog/Fog';
import type { SceneFx } from './sceneFx';
import { roomKeyAt } from '@/game/world/WorldModel';
import { standingSpot } from './roomSpots';
import { store } from '@/redux/store';
import { setRoomKey } from '@/redux/slices/hudSlice';

export interface RoomsDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  model: WorldModel;
  terrain: Terrain;
  fog: () => FogOfWar | null;
  fx: () => SceneFx;
}

export class Rooms implements RoomApi {
  current: RoomCoord = { rx: 0, ry: 0 };
  /**
   * 醒着的房间：这一局（上次整张图重置以来）玩家进过的。没醒的房间里会自己动的东西（巡逻的怪物、移动方块）原地等着，
   * 免得玩家还没到，那边的机关已经自己演完了；引线、碎块下落这些玩家引起的后果不管醒没醒照常发生
   */
  private awake = new Set<string>();
  readonly w: number;
  readonly h: number;
  readonly pxW: number;
  readonly pxH: number;

  constructor(private readonly d: RoomsDeps) {
    this.w = d.model.roomW; this.h = d.model.roomH;
    this.pxW = this.w * d.cfg.tile; this.pxH = this.h * d.cfg.tile;
  }

  of(x: number, y: number): RoomCoord { return { rx: Math.floor(x / this.pxW), ry: Math.floor(y / this.pxH) }; }
  same(a: RoomCoord, b: RoomCoord): boolean { return a.rx === b.rx && a.ry === b.ry; }
  key(r: RoomCoord): string | null { return roomKeyAt(this.d.model, r.rx, r.ry); }
  find(key: string): RoomCoord | null {
    for (let ry = 0; ry < this.d.model.layout.length; ry++) {
      const rx = this.d.model.layout[ry].indexOf(key);
      if (rx >= 0) return { rx, ry };
    }
    return null;
  }
  flag(r: RoomCoord, flag: Parameters<RoomApi['flag']>[1]): boolean {
    const k = roomKeyAt(this.d.model, r.rx, r.ry);
    return !!k && !!this.d.model.roomFlags?.[k]?.[flag];
  }
  standingSpot(r: RoomCoord): ReturnType<RoomApi['standingSpot']> { return standingSpot(this.d.terrain, r, this.w, this.h, this.d.cfg.playerHeight); }

  isAwake(r: RoomCoord): boolean { return this.awake.has(`${r.rx},${r.ry}`); }
  wake(r: RoomCoord): void { this.awake.add(`${r.rx},${r.ry}`); }
  /** 整张图重置：所有房间重新睡着（复活时再叫醒复活点所在的那间） */
  sleepAll(): void { this.awake.clear(); }

  /** 进这个房间：迷雾、画面效果、镜头都切过去（instant = 不平移，直接跳）；这个房间醒过来 */
  enter(r: RoomCoord, instant: boolean): void {
    this.wake(r);
    const { scene, cfg } = this.d;
    this.current = r;
    this.d.fog()?.setRoom(r);
    const sx = r.rx * this.pxW, sy = r.ry * this.pxH;
    this.d.fx().setRoom(sx, sy, this.pxW, this.pxH);
    scene.tweens.killTweensOf(scene.cameras.main);
    if (instant) scene.cameras.main.setScroll(sx, sy);
    else scene.tweens.add({ targets: scene.cameras.main, scrollX: sx, scrollY: sy, duration: cfg.roomPanMs, ease: 'Sine.out' });
    store.dispatch(setRoomKey(this.key(r) ?? '?'));
  }

  /** 房间在世界里的左上角（格） */
  cellOrigin(r: RoomCoord = this.current): { x0: number; y0: number } { return { x0: r.rx * this.w, y0: r.ry * this.h }; }
}
