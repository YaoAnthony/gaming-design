// ===== 把一关画成一张桌上的小舞台（按设计稿的参考图）=====
// 游戏画面套在一圈木框里（四角是方木块），立在一张深青色的木桌面上（木板条拼的，前沿压条，下面裙板和车木桌腿）；
// 关卡里的方块按大小画成不同的东西：矮扁的是悬空的木板，别的是木箱（按高宽比挑扁的 / 矮的 / 正方的）；
// 头顶吊着一盏灯（聚光灯挂在它的灯泡上，见 Lighting3D）；桌上散着杂物（关卡数据的 clutter），撞得上的合成一棵 BVH（collider.ts）。
// 所有东西都是 3D asset/props 建的模型（props.ts 读 props.glb），这里只管按关卡数据缩放摆放。
import * as THREE from 'three';
import { MODELS } from '@/asset';
import { PROPS_PALETTE } from '@/shared/palette';
import type { Block3D, Level3D, Vec3 } from './level';
import { crateVariant, PropSet, type PropOrigin } from './props';
import { StaticCollider } from './collider';

/** 木框：梁多粗、多厚；四角的方块多大；底边的梁往桌面里沉多少 */
const FRAME = { beam: 1.4, depth: 1.2, corner: 2.0, sink: 0.2 };
/** 桌面：木板条多宽、桌面多厚、前沿压条多粗、裙板多高；桌腿多高、几条 */
const DECK = { plank: 3, thick: 1.2, lip: 0.4, apron: 1.6 };
const LEG = { h: 3, count: 5 };
/** 多矮的方块算悬空的木板（格） */
const PLANK_H = 0.6;

export class LevelView {
  readonly object = new THREE.Group();
  /** 撞得上的杂物（模型读进来之后才有） */
  collider: StaticCollider | null = null;
  private props: PropSet | null = null;
  private disposed = false;

  /** @param screen 游戏画面多宽多高（格），木框按它围；lampAt 吊灯的灯泡挂在哪（格） */
  constructor(private readonly level: Level3D, private readonly screen: { w: number; h: number }, private readonly lampAt: Vec3, lit = true) {
    PropSet.load(MODELS.props, PROPS_PALETTE, { lit, unlit: ['lamp_bulb'] }).then(p => {
      if (this.disposed) { p.dispose(); return; }
      this.props = p;
      this.build();
    }, err => console.error('场景件的模型读不进来', err));
  }

  private build(): void {
    const level = this.level, ground = level.blocks[level.grid.block];
    if (ground) this.deck(ground);
    this.frame(this.screen.w, this.screen.h);
    level.blocks.forEach((b, i) => { if (i !== level.grid.block) this.block(b); });
    this.put('lamp', [1, 1, 1], [this.lampAt.x, this.lampAt.y, this.lampAt.z], 'own');
    const solid = new THREE.Group();
    this.object.add(solid);
    for (const c of level.clutter ?? []) {
      const s = c.scale ?? 1;
      const o = this.put(c.kind, [s, s, s], [c.at.x, c.at.y, c.at.z], 'bottom', [0, c.yaw ?? 0, 0]);
      if (o && c.solid !== false) solid.add(o);
    }
    this.collider = StaticCollider.fromObject(solid);
  }

  /** 放一件：scale = 每根轴缩放多少（倍），at = 原点放哪（格），rot = 绕 x/y/z 转几度 */
  private put(name: string, scale: [number, number, number], at: [number, number, number], origin: PropOrigin = 'bottom', rot: [number, number, number] = [0, 0, 0]): THREE.Group | null {
    const p = this.props?.spawn(name, origin);
    if (!p) return null;
    p.object.scale.set(scale[0], scale[1], scale[2]);
    p.object.position.set(at[0], at[1], at[2]);
    p.object.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
    this.object.add(p.object);
    return p.object;
  }

  /** 放一件并缩放到这么大（格）：size 的某根轴给 null 就保持模型自己的比例（按别的轴算） */
  private fit(name: string, size: [number, number, number], at: [number, number, number], origin: PropOrigin = 'bottom', rot: [number, number, number] = [0, 0, 0]): THREE.Group | null {
    const p = this.props?.spawn(name, origin);
    if (!p) return null;
    this.object.add(p.object);
    p.object.scale.set(size[0] / p.size.x, size[1] / p.size.y, size[2] / p.size.z);
    p.object.position.set(at[0], at[1], at[2]);
    p.object.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
    return p.object;
  }

  /** 桌面：地板那块方块画成木板条拼的深青色台面，前沿压条，底下裙板和桌腿 */
  private deck(g: Block3D): void {
    const top = g.at.y + g.size.y, front = g.at.z + g.size.z / 2, left = g.at.x - g.size.x / 2;
    const bottom = top - DECK.thick;
    for (let x = 0; x < g.size.x; x += DECK.plank) {
      const w = Math.min(DECK.plank, g.size.x - x);
      this.fit('deck_plank', [w, DECK.thick, g.size.z], [left + x + w / 2, bottom, g.at.z]);
    }
    this.fit('deck_lip', [g.size.x, DECK.lip, DECK.lip], [g.at.x, top - DECK.lip + 0.02, front - DECK.lip / 2 + 0.03]);
    this.fit('desk_apron', [g.size.x, DECK.apron, 0.3], [g.at.x, bottom - DECK.apron, front - 0.12]);
    for (let i = 0; i < LEG.count; i++) {
      const x = left + (i + 0.5) * g.size.x / LEG.count;
      this.put('desk_leg', [1, 1, 1], [x, bottom - DECK.apron - LEG.h, front - 1.0]);
    }
  }

  /** 屏幕四周的木框（屏幕立在 z = 0，底边在 y = 0）：四根梁 + 四个角块 */
  private frame(w: number, h: number): void {
    const b = FRAME.beam, d = FRAME.depth, c = FRAME.corner, z = d / 2 - 0.2;
    const x0 = -w / 2 - b / 2, x1 = w / 2 + b / 2, y0 = -b / 2 + FRAME.sink, y1 = h + b / 2;
    this.fit('frame_beam', [w + 2 * b, b, d], [0, y1, z], 'center');
    this.fit('frame_beam', [w + 2 * b, b, d], [0, y0, z], 'center');
    this.fit('frame_beam', [y1 - y0 + b, b, d], [x0, (y0 + y1) / 2, z], 'center', [0, 0, 90]);
    this.fit('frame_beam', [y1 - y0 + b, b, d], [x1, (y0 + y1) / 2, z], 'center', [0, 0, 90]);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) this.fit('frame_corner', [c, c, d + 0.4], [x, y, z + 0.1], 'center');
  }

  /** 关卡里的一个方块：悬空的木板 / 木箱 */
  private block(b: Block3D): void {
    const name = b.size.y <= PLANK_H ? 'plank' : crateVariant(b.size);
    this.fit(name, [b.size.x, b.size.y, b.size.z], [b.at.x, b.at.y, b.at.z]);
  }

  dispose(): void {
    this.disposed = true;
    this.props?.dispose();
    this.object.removeFromParent();
  }
}
