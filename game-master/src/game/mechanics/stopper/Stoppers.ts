// ===== 挡块：只挡怪物和箱子，主角直接穿过去 =====
// - 放在路中间：立在格子正中，怪物走到这里被挡住（巡逻的掉头，追人的停下），箱子进不了这一格
// - 放在崖边：自己判断哪边是悬崖，立在这一格里靠悬崖那边（离崖边留 STOPPER_BAR.inset 像素，整根站在地上）：
//   箱子进不了这一格（推到它前面一格就停），推不下去；追人的夹子桑冲不下去
// - 每帧按地形重新判断（geometry.ts 的 stopperMount）：脚下的地没了就失效（不挡、不画），地形复原了自己回来。没有自己的状态，存档不用记
// - 挡怪物靠一根 BAR 大小的静态碰撞体（只和怪物碰）；挡箱子按格线算（PushBlocks.pathClear 问 blocksBox），箱子永远对齐格子
import Phaser from 'phaser';
import type { PlayContext } from '@/game/core/PlayContext';
import type { SpawnAt } from '@/type';
import type { Mechanic } from '../define';
import { crossBlocked, stopperBar, stopperMount, type StopperCell } from './geometry';

/** 挡怪物的柱子多宽、多高（像素）：和贴图里立柱一样宽，比夹子桑高；立在崖边时离崖边多远（贴图底座比立柱宽 3 像素，留 4 像素才整个站在地上） */
export const STOPPER_BAR = { w: 6, h: 26, inset: 4 };

interface Stopper extends StopperCell {
  img: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
}

export class Stoppers implements Mechanic {
  private list: Stopper[] = [];
  private group: Phaser.Physics.Arcade.StaticGroup;

  constructor(private ctx: PlayContext) {
    this.group = ctx.scene.physics.add.staticGroup();
  }

  /** 地图上的挡块物件（立在哪等 start 之后按地形判断） */
  add(at: SpawnAt): void {
    const { scene } = this.ctx;
    const img = scene.add.image(0, 0, 'stopper').setOrigin(0.5, 1).setDepth(2.55).setVisible(false);
    const zone = scene.add.zone(0, 0, STOPPER_BAR.w, STOPPER_BAR.h);
    this.group.add(zone);
    (zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.list.push({ x: at.cell.x, y: at.cell.y, mount: null, img, zone });
  }

  start(): void {
    this.ctx.scene.physics.add.collider(this.ctx.enemies.group, this.group);
    this.refresh();
  }

  /** 每帧：地形变了（炸掉、掉下来、复原）就重新判断立在哪 */
  update(): void { this.refresh(); }

  /**
   * 箱子（碰撞框 b）往 dir 挪一格会不会被挡块挡住：它在 dir 那一侧最外的那一列，每一行都问一遍 crossBlocked
   */
  blocksBox(b: { left: number; right: number; top: number; bottom: number }, dir: -1 | 1): boolean {
    const T = this.ctx.cfg.tile, eps = 0.05;
    const col = Math.floor((dir > 0 ? b.right - eps : b.left + eps) / T);
    for (let row = Math.floor((b.top + eps) / T); row <= Math.floor((b.bottom - eps) / T); row++)
      if (crossBlocked(this.list, col, row, dir)) return true;
    return false;
  }

  destroy(): void {
    this.list.forEach(s => { s.img.destroy(); s.zone.destroy(); });
    this.list = [];
  }

  private refresh(): void {
    const t = this.ctx.terrain, T = this.ctx.cfg.tile;
    const ground = { footing: (x: number, y: number) => t.isFooting(x, y), solid: (x: number, y: number) => t.isSolid(x, y) };
    for (const s of this.list) {
      const mount = stopperMount(ground, s.x, s.y);
      if (mount === s.mount) continue;
      s.mount = mount;
      const body = s.zone.body as Phaser.Physics.Arcade.StaticBody;
      if (!mount) { s.img.setVisible(false); body.enable = false; continue; }
      const bar = stopperBar(mount, s.x, s.y, T, STOPPER_BAR.w, STOPPER_BAR.h, STOPPER_BAR.inset);
      s.zone.setPosition(bar.x + bar.w / 2, bar.y + bar.h / 2);
      body.enable = true;
      body.updateFromGameObject();
      s.img.setPosition(bar.x + bar.w / 2, bar.y + bar.h).setVisible(true);
    }
  }
}
