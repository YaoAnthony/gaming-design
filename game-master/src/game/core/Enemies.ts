// ===== 巡逻怪物「夹子桑」（核心）：物件 M、Boss 吐出来的小夹子都在这一组 =====
import Phaser from 'phaser';
import type { EnemySpawn, RoomCoord } from '@/type';
import { Enemy } from '@/sprite';
import { playCrush } from '@/particle';
import type { PlayContext } from './PlayContext';
import { Colors, hex } from '@/shared/palette';
import { overlaps } from './overlap';

export class Enemies {
  readonly group: Phaser.Physics.Arcade.Group;
  private spawns: EnemySpawn[] = [];

  constructor(private ctx: PlayContext) {
    this.group = ctx.scene.physics.add.group({ classType: Enemy, runChildUpdate: false });
    ctx.scene.physics.add.collider(this.group, ctx.terrain.layer, undefined, ctx.terrain.landsOnOneWay);
  }

  /** 地图上的怪物：记下出生位置，重置时按它复原 */
  addSpawn(sp: EnemySpawn): void { this.spawns.push(sp); this.spawn(sp); }
  /** 临时的怪物（不会被重置复原） */
  add(e: Enemy): void { this.group.add(e); }
  list(): Enemy[] { return (this.group.getChildren() as Enemy[]).filter(e => e.active); }

  kill(e: Enemy): void {
    if (!e.active) return;
    playCrush(this.ctx.sparks, e.x, e.y);
    this.ctx.fx.flash('msg.monsterSquashed', hex(Colors.violet));
    e.destroy();
  }

  /** 这个房间的怪物回到出生位置（按 R） */
  resetRoom(r: RoomCoord): void {
    const same = this.ctx.rooms.same;
    this.list().forEach(e => { if (same(e.spawn, r)) e.destroy(); });
    this.spawns.filter(sp => same(sp, r)).forEach(sp => this.spawn(sp));
  }

  /** 所有怪物回到出生位置（死亡重置整张图） */
  resetAll(): void {
    (this.group.getChildren() as Enemy[]).slice().forEach(e => e.destroy());
    this.spawns.forEach(sp => this.spawn(sp));
  }

  /**
   * 巡逻（所在房间醒了才开始，见 Rooms.isAwake）；看见主角就追过去（CLIP_CHASE），走到跟前就扑咬（CLIP_ATTACK，都在 sprite/Enemy.ts）；
   * 快速下落的碎块压扁它；碰到身子或者被咬到 → 扣一颗心（ctx.hurt）
   */
  update(): void {
    const { ctx } = this, cfg = ctx.cfg, T = cfg.tile;
    const playerRect = ctx.player.rect(), alive = !ctx.dead && !ctx.won, now = ctx.scene.time.now;
    const target = alive && ctx.player.visible ? playerRect : null;   // 主角死了 / 还没被放进来：不追不咬
    this.list().forEach(e => {
      if (!e.awake && ctx.rooms.isAwake(ctx.rooms.of(e.body.center.x, e.body.center.y))) e.awake = true;
      if (e.awake) e.watch(target, now, ctx.terrain);
      if (e.awake && target) e.considerBite(target, now, T);
      if (e.awake) e.step(ctx.terrain, ctx.rooms.pxW, cfg.enemySpeed, (x, y) => ctx.terrain.isFooting(x, y) || this.ctx.debris.occupies(x, y));   // 纸上也能走
      else e.setVelocityX(0);   // 房间还没醒：原地等着（重力照常，脚下被烧空了照样掉）
      const r = e.rect();
      let crushed = false;
      ctx.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
        if (ch.vy >= cfg.crushMinSpeed && overlaps(cx, cy, w, h, r)) crushed = true;
      });
      if (crushed) { this.kill(e); return; }
      const bite = e.biteRect(T);
      const hit = Phaser.Geom.Intersects.RectangleToRectangle(r, playerRect) || (!!bite && Phaser.Geom.Intersects.RectangleToRectangle(bite, playerRect));
      if (alive && hit) ctx.hurt('death.caughtByMonster', { x: e.x, y: e.y });   // 扣一颗心、被弹开
    });
  }

  private spawn(sp: EnemySpawn): void { this.group.add(new Enemy(this.ctx.scene, sp)); }
}
