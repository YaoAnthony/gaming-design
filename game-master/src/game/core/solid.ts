// ===== 由实心格子拼成、整体一起动的东西（纸、移动方块）的物理体 =====
// 一组格子按行并成横条，一条一个物理体，直接改位置（directControl）：站在上面的人、箱子、钥匙被带着走。
// 每条只在外露的面上碰撞：旁边是自己的格子的那一面关掉（checkCollision）。这正是瓦片层自己的做法（faceTop / faceBottom）。
// 不关的话：Phaser 重力竖直时先按竖直方向分开、再按水平方向分开，人贴着侧面往上跳（被推着、或按着方向），
// 头顶一过两条之间的接缝，就被当成撞到天花板：按回接缝下面、竖直速度清零，跳跃当场取消。
// 同一行相邻的格子只有上下两面的外露情况一样才并成一条：小船的船舱底那格顶面外露，两边船沿底下的格子顶面不外露，得分开。
import Phaser from 'phaser';
import type { CellRef } from '@/type';
import { pushOutX } from '@/game/mechanics/carry/keyFall';

export interface Faces { up: boolean; down: boolean; left: boolean; right: boolean }
/** 一条横条：格坐标（和传进来的格子同一坐标系）、长度、哪几面外露 */
export interface SolidRun { x: number; y: number; len: number; faces: Faces }

/** 站在顶面上算「站着」：脚底离顶面的距离（像素） */
export const RIDE_TOLERANCE = 4;
/** 判断人 / 怪挡路、被推时，身体往里收这么多像素（贴着边不算） */
export const INSET = 2;

/** 一组格子并成横条，算好每条的外露面。按行、再按列排序 */
export function solidRuns(cells: CellRef[]): SolidRun[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const own = new Set(cells.map(c => key(c.x, c.y)));
  const byRow = new Map<number, number[]>();
  cells.forEach(c => { const r = byRow.get(c.y) ?? []; r.push(c.x); byRow.set(c.y, r); });
  const runs: SolidRun[] = [];
  byRow.forEach((xs, y) => {
    xs.sort((a, b) => a - b);
    const vertical = (x: number) => (own.has(key(x, y - 1)) ? 0 : 1) | (own.has(key(x, y + 1)) ? 0 : 2);
    let start = xs[0], prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1 && vertical(xs[i]) === vertical(start)) { prev = xs[i]; continue; }
      runs.push({
        x: start, y, len: prev - start + 1,
        faces: { up: !own.has(key(start, y - 1)), down: !own.has(key(start, y + 1)), left: !own.has(key(start - 1, y)), right: !own.has(key(prev + 1, y)) },
      });
      if (i < xs.length) { start = xs[i]; prev = xs[i]; }
    }
  });
  return runs.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 一条横条的物理体（看不见的图）：不可推动、不受重力、直接改位置，只在外露的面上碰撞。
 * 位置还没摆：摆好第一次之后调 settleBody，不然第一步会被当成从 (0,0) 一下子挪过来，把站在上面的甩飞
 */
export function makeSolidBody(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group, run: SolidRun, T: number): Phaser.Physics.Arcade.Image {
  const img = scene.physics.add.image(0, 0, 'spark').setVisible(false);
  group.add(img);   // 组会套上它的默认设置，自己的设置要在这之后
  const body = img.body as Phaser.Physics.Arcade.Body;
  body.setSize(run.len * T, T, true);
  body.setAllowGravity(false);
  body.setImmovable(true);
  body.pushable = false;
  body.setDirectControl(true);   // 直接改位置，物理引擎按位移算速度
  body.setFriction(1, 0);        // 横着挪多少，站在上面的就跟着挪多少（物理组建的物体默认是 0，带不动）
  const f = run.faces;
  body.checkCollision.up = f.up; body.checkCollision.down = f.down;
  body.checkCollision.left = f.left; body.checkCollision.right = f.right;
  return img;
}

/**
 * 物理体第一次摆到位置之后归位：新建的物理体在 (0,0)，不归位的话第一步会被当成一下子挪了几百像素，把站在上面的甩出去。
 * body.reset 按贴图左上角算位置、不管 offset，而这里的碰撞框比贴图大得多（偏移几十像素），第一帧还会被当成挪了一个偏移量，
 * 所以再按贴图 + offset 同步一次，上一帧的位置也记成这里（directControl 的位移按 autoFrame 算，它也要记）
 */
export function settleBody(img: Phaser.Physics.Arcade.Image): void {
  const body = img.body as Phaser.Physics.Arcade.Body & { autoFrame: Phaser.Math.Vector2 };   // autoFrame：类型声明里没写
  body.reset(img.x, img.y);
  body.updateFromGameObject();
  body.prev.copy(body.position);
  body.prevFrame.copy(body.position);
  body.autoFrame.copy(body.position);
}

/** 这具身体站在 [left, right] × top 这个顶面上吗（横向往里收 inset 像素） */
export function standsOn(b: Phaser.Physics.Arcade.Body, left: number, right: number, top: number, inset = 0): boolean {
  return Math.abs(b.bottom - top) <= RIDE_TOLERANCE && b.right > left + inset && b.left < right - inset;
}

/**
 * 这具身体站在这些组里哪个物理体的顶面上，那个物理体这一帧横着挪了多少像素（没站在任何一个上面 = 0）。
 * 在场景 update 里调（物理这一步已经跑完）：directControl 的物理体这一帧的位移就是 deltaX()
 */
export function shiftUnder(b: Phaser.Physics.Arcade.Body, groups: Phaser.Physics.Arcade.Group[]): number {
  for (const g of groups) for (const child of g.getChildren()) {
    const p = (child as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body | null;
    if (!p?.enable || !p.checkCollision.up || !standsOn(b, p.left, p.right, p.top, 1)) continue;
    return p.deltaX();
  }
  return 0;
}

/**
 * 被会动的东西（移动方块、纸）带着走的身体，被带进了墙里就推回墙外（横向）。
 * 瓦片层只挡自己带速度撞进去的物体，被平台的摩擦力挪进去的它不管：站在平台上、前面有墙，人会跟着平台穿墙。
 * 推回去之后平台从脚下走开，人就留在墙前面掉下去（钥匙的「刮板」是同一个道理）。改的是 body，postUpdate 会同步给精灵
 */
export function pushRiderOutOfWalls(b: Phaser.Physics.Arcade.Body, T: number, solid: (cx: number, cy: number) => boolean): boolean {
  const x = pushOutX(b.left, b.width, b.top, b.bottom, T, solid);
  if (x === null) return false;
  b.x = x; b.updateCenter();
  return true;
}

/** 像素矩形 [x0, x1) × [y0, y1) 盖到的格子里有没有 solid 说是实心的 */
export function rectHitsCells(x0: number, x1: number, y0: number, y1: number, T: number, solid: (cx: number, cy: number) => boolean): boolean {
  for (let cy = Math.floor(y0 / T); cy <= Math.floor((y1 - 1) / T); cy++)
    for (let cx = Math.floor(x0 / T); cx <= Math.floor((x1 - 1) / T); cx++)
      if (solid(cx, cy)) return true;
  return false;
}
