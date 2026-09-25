// ===== 巡逻怪物（核心）：物件 M、Boss 吐出来的小史莱姆都在这一组 =====
import Phaser from 'phaser';
import type { EnemySpawn, RoomCoord } from '@/type';
import { Enemy } from '@/sprite';
import { playCrush } from '@/particle';
import type { PlayContext } from './PlayContext';

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
    this.ctx.fx.flash('怪物被压扁了', '#9b5de5');
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

  /** 巡逻；快速下落的碎块压扁它；碰到玩家 → 死 */
  update(): void {
    const { ctx } = this, cfg = ctx.cfg;
    const playerRect = ctx.player.rect();
    this.list().forEach(e => {
      e.step(ctx.terrain, ctx.rooms.pxW, cfg.enemySpeed);
      const r = e.rect();
      let crushed = false;
      ctx.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
        if (ch.vy >= cfg.crushMinSpeed && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), r)) crushed = true;
      });
      if (crushed) this.kill(e);
      else if (!ctx.dead && !ctx.won && Phaser.Geom.Intersects.RectangleToRectangle(r, playerRect)) ctx.die('被怪物抓住了');
    });
  }

  private spawn(sp: EnemySpawn): void { this.group.add(new Enemy(this.ctx.scene, sp)); }
}
