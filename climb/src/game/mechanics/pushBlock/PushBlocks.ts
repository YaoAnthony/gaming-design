// ===== 可推的箱子：1x1、2x2 =====
// - 有重力，推出边缘会掉下去；停下来以后自己对齐格子；爆炸炸不动；可以站在上面
// - 人撞不动它（pushable = false），只有「贴着它、往它那边走、站在地上、身高 ≥ 箱子高」才推得动，推的时候人和箱子都是 pushSpeed
// - 前面被砖或别的箱子挡住就推不动（不能连推）
// - 死亡 / R：回到原位
import Phaser from 'phaser';
import type { RoomCoord } from '@/type';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';

interface Block {
  sprite: Phaser.Physics.Arcade.Image;
  /** 边长（格） */
  size: number;
  /** 出生位置（贴图中心）和所在房间：重置时回到这里 */
  home: { x: number; y: number };
  room: RoomCoord;
  /** 这一帧有没有被推 */
  pushed: boolean;
}

/** 身高比箱子矮这么多以内也算够高（主角本身 0.94 格，也要能推 1 格的箱子） */
const HEIGHT_TOLERANCE = 0.1;
/** 贴着箱子：人和箱子的边相距不到这么多像素 */
const CONTACT_PX = 2;
/** 碰撞框每边比贴图小这么多像素，免得在一格宽 / 一格高的口子里卡住 */
const INSET = 1;

export class PushBlocks implements Mechanic {
  private list: Block[] = [];
  private group: Phaser.Physics.Arcade.Group;

  constructor(private ctx: PlayContext) {
    this.group = ctx.scene.physics.add.group();
    ctx.scene.physics.add.collider(this.group, ctx.terrain.layer);
    ctx.scene.physics.add.collider(this.group, this.group);
  }

  /** 放一个箱子：1x1 以那一格为中心；2x2 以那一格为左下角 */
  addBlock(size: number, cell: { x: number; y: number; rx: number; ry: number }): void {
    const T = this.ctx.cfg.tile;
    const x = cell.x * T + (size * T) / 2, y = (cell.y + 1) * T - (size * T) / 2;
    const sprite = this.group.create(x, y, size === 1 ? 'crate1' : 'crate2') as Phaser.Physics.Arcade.Image;
    sprite.setDepth(2.6);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(size * T - INSET * 2, size * T - INSET, false).setOffset(INSET, INSET);   // 底边贴着贴图底边
    body.pushable = false;
    body.setMaxVelocityY(this.ctx.cfg.maxFall);
    this.list.push({ sprite, size, home: { x, y }, room: { rx: cell.rx, ry: cell.ry }, pushed: false });
  }

  // ---------- 生命周期 ----------
  start(): void {
    const { scene, player, enemies } = this.ctx;
    scene.physics.add.collider(player, this.group);
    scene.physics.add.collider(enemies.group, this.group);
  }

  /** 每帧：没被推的箱子停下、对齐格子（推的逻辑在 updateAlive 里，后跑，会覆盖这里的速度） */
  update(): void {
    const T = this.ctx.cfg.tile, speed = this.ctx.cfg.pushSpeed;
    this.list.forEach(bl => {
      bl.pushed = false;
      const s = bl.sprite, b = s.body as Phaser.Physics.Arcade.Body;
      if (!b.blocked.down && !b.touching.down) { s.setVelocityX(0); return; }   // 在空中：直直往下掉
      const left = s.x - (bl.size * T) / 2, target = Math.round(left / T) * T, diff = target - left;
      if (Math.abs(diff) < 0.5) { s.setVelocityX(0); if (diff) { s.x += diff; b.updateFromGameObject(); } return; }
      s.setVelocityX(Phaser.Math.Clamp(diff * 8, -speed, speed));
    });
  }

  /** 人贴着箱子往那边走 → 推 */
  updateAlive(): void {
    const { ctx } = this, p = ctx.player, pb = p.body, speed = ctx.cfg.pushSpeed;
    const dir = Math.sign(pb.velocity.x);
    if (!dir || !pb.blocked.down && !pb.touching.down) return;
    for (const bl of this.list) {
      const bb = bl.sprite.body as Phaser.Physics.Arcade.Body;
      if (pb.bottom <= bb.top + 2 || pb.top >= bb.bottom - 2) continue;                                   // 上下没对上（比如人站在箱子上）
      const gap = dir > 0 ? bb.left - pb.right : pb.left - bb.right;
      if (gap < -CONTACT_PX * 2 || gap > CONTACT_PX) continue;                                            // 没贴着
      if (!bb.blocked.down && !bb.touching.down) continue;                                                // 箱子在空中
      if (p.heightTiles + HEIGHT_TOLERANCE < bl.size) continue;                                           // 不够高
      if (!this.pathClear(bl, dir)) continue;                                                             // 前面挡住了
      bl.sprite.setVelocityX(dir * speed);
      p.setVelocityX(dir * speed);
      bl.pushed = true;
      return;
    }
  }

  /** 死亡 / R：箱子回到原位（按 R 只回当前房间的） */
  onReset(scope: 'room' | 'world'): void {
    this.list.forEach(bl => {
      if (scope === 'room' && !this.ctx.rooms.same(bl.room, this.ctx.rooms.current)) return;
      const b = bl.sprite.body as Phaser.Physics.Arcade.Body;
      bl.sprite.setAngle(0).setScale(1).setAlpha(1);
      b.enable = true;
      b.reset(bl.home.x, bl.home.y);
    });
  }

  vortexTargets(): Suckable[] {
    this.list.forEach(bl => { (bl.sprite.body as Phaser.Physics.Arcade.Body).enable = false; });
    return this.list.map(bl => bl.sprite);
  }

  // ---------- 内部 ----------
  /** 箱子前面一列（它的整个高度）没有砖、也没有别的箱子 */
  private pathClear(bl: Block, dir: number): boolean {
    const { ctx } = this, T = ctx.cfg.tile, t = ctx.terrain, bb = bl.sprite.body as Phaser.Physics.Arcade.Body;
    const ax = dir > 0 ? bb.right + 1 : bb.left - 2;
    const cx = Math.floor(ax / T);
    for (let cy = Math.floor(bb.top / T); cy <= Math.floor((bb.bottom - 1) / T); cy++)
      if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h || t.isSolid(cx, cy)) return false;
    const ahead = new Phaser.Geom.Rectangle(dir > 0 ? bb.right : bb.left - 3, bb.top + 2, 3, bb.height - 4);
    return !this.list.some(o => {
      if (o === bl) return false;
      const ob = o.sprite.body as Phaser.Physics.Arcade.Body;
      return Phaser.Geom.Intersects.RectangleToRectangle(ahead, new Phaser.Geom.Rectangle(ob.x, ob.y, ob.width, ob.height));
    });
  }
}
