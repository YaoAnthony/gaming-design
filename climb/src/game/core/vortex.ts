// ===== 旋涡：镜头一边转一边拉近门口；房间里的人、怪、碎块、角色和一把碎屑沿螺旋线缩进门里 =====
import type Phaser from 'phaser';
import type { Point } from '@/type';
import type { PlayContext, Suckable } from './PlayContext';

/** @param extra 机制提供的要一起吸走的东西（NPC、Boss……） */
export function vortex(ctx: PlayContext, p: Point, extra: Suckable[], then: () => void): void {
  const scene: Phaser.Scene = ctx.scene;
  const DUR = 1500, cam = scene.cameras.main, T = ctx.cfg.tile;
  cam.pan(p.x, p.y - T / 2, DUR, 'Sine.easeIn');
  cam.zoomTo(3, DUR, 'Sine.easeIn');
  cam.rotateTo(Math.PI * 1.25, false, DUR, 'Sine.easeIn');
  const suck = (obj: Suckable, delay: number, dur: number) => {
    const dx = obj.x - p.x, dy = obj.y - p.y;
    const r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx), s0 = obj.scale;
    const k = { t: 0 };
    scene.tweens.add({ targets: k, t: 1, delay, duration: dur, ease: 'Quad.easeIn', onUpdate: () => {
      const r = r0 * (1 - k.t), a = a0 + k.t * Math.PI * 3;
      obj.setPosition(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      obj.setScale(s0 * (1 - k.t * 0.9)); obj.setAngle(k.t * 720); obj.setAlpha(1 - k.t * 0.6);
    } });
  };
  const room = ctx.rooms.of(p.x, p.y);
  const inRoom = (x: number, y: number) => ctx.rooms.same(ctx.rooms.of(x, y), room);
  // 人、怪、机制给的东西（骷髅、Boss……）
  suck(ctx.player, 150, DUR - 200);
  ctx.enemies.list().forEach(e => { if (inRoom(e.x, e.y)) { e.body.enable = false; suck(e, Math.random() * 300, DUR - 400); } });
  extra.forEach(o => { if (o.active && inRoom(o.x, o.y)) suck(o, Math.random() * 300, DUR - 400); });
  // 碎块只能淡出（容器缩放会绕原点转）
  ctx.terrain.chunks.forEach(ch => scene.tweens.add({ targets: ch.container, alpha: 0, duration: DUR * 0.6 }));
  // 一把碎屑：从房间各处沿螺旋飞进门
  const x0 = room.rx * ctx.rooms.pxW, y0 = room.ry * ctx.rooms.pxH;
  const colors = [0x8d5a3b, 0x5d6470, 0xc9b27c, 0xffd166, 0x4cc9f0, 0xf1efe6];
  for (let i = 0; i < 60; i++) {
    const bit = scene.add.rectangle(x0 + Math.random() * ctx.rooms.pxW, y0 + Math.random() * ctx.rooms.pxH, 3 + Math.random() * 6, 3 + Math.random() * 6, colors[i % colors.length]).setDepth(9);
    suck(bit, Math.random() * 500, 700 + Math.random() * 600);
  }
  cam.shake(DUR, 0.003);
  scene.time.delayedCall(DUR, then);
}
