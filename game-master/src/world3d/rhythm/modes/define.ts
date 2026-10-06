// ===== 节奏玩法的注册表：每种玩法一个文件，在 modes/index.ts 里注册 =====
// 这里是 3D 的玩法（rhythm/modes.ts 里 realm = deep 的那些）：主角跳出画面之后在大道上玩的。
// 一张谱的每一段各有一个玩法实例，只管自己那一段的音符：draw 一直调（音符提前出发，上一段还没完就要开始画），update 只在轮到它时调。
import * as THREE from 'three';
import type { ModeId, Note, Scoreboard } from '@/rhythm';
import type { RhythmConfig } from '@/type';
import type { Hero3D } from '../../Hero3D';
import type { WorldMove } from '../../input';

/** 玩法拿得到的东西。坐标：原点在屏幕底边中点，单位是格，+z 朝镜头，地面是 y = 0 */
export interface ModeContext {
  /** 往这里加自己要画的东西 */
  root: THREE.Group;
  hero: Hero3D;
  /** 屏幕宽高（格）、主角那一排离屏幕多远（格）、音符提前多少毫秒出发 */
  w: number;
  h: number;
  heroZ: number;
  travelMs: number;
  config(): RhythmConfig;
  /** 这一场的成绩：判定记到这里 */
  score: Scoreboard;
  /** 主角挨了一下（被墙撞到）：扣一滴血 */
  hurt(): void;
  /** 出一声起跳爆炸 */
  boom(): void;
  /** Game Master 现在在哪（屏幕倒着，他跟着在斜面上）；砸到他了：他缩一下 */
  bossAt(): THREE.Vector3;
  bossHit(): void;
}

export interface RhythmMode {
  /** 镜头摆在哪、看向哪；roll = 镜头往一边歪多少度（往右歪为正），不给就是正的 */
  camera(): { eye: THREE.Vector3; look: THREE.Vector3; roll?: number };
  /** 轮到这种玩法时人站在哪（脚底中心） */
  spot(): THREE.Vector3;
  /** 轮到 / 轮完：显示、收起自己的辅助线之类 */
  setActive(on: boolean): void;
  /** 轮到它时每帧调：读按键、判定、摆人 */
  update(nowMs: number, dt: number, move: WorldMove): void;
  /** 每帧都调：把自己那一段正在飞的音符摆到位 */
  draw(nowMs: number): void;
  dispose(): void;
}

export type ModeFactory = (ctx: ModeContext, notes: Note[]) => RhythmMode;

const factories = new Map<ModeId, ModeFactory>();

/** 同一个 id 再注册就换成新的（开发期热更新会把玩法文件重新跑一遍） */
export function defineRhythmMode(id: ModeId, factory: ModeFactory): void { factories.set(id, factory); }

/** 这种玩法注册过没有（测试查「每种 3D 玩法都有实现」用） */
export const hasRhythmMode = (id: ModeId): boolean => factories.has(id);

export function createRhythmMode(id: ModeId, ctx: ModeContext, notes: Note[]): RhythmMode {
  const f = factories.get(id);
  if (!f) throw new Error(`没有注册这种节奏玩法：${id}`);
  return f(ctx, notes);
}

/** 一批同样的方块（音符）：每帧重新摆 */
export class NoteBoxes {
  readonly mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private n = 0;
  private readonly m = new THREE.Matrix4();

  /** 方块的原点在底面中心 */
  constructor(parent: THREE.Object3D, w: number, h: number, d: number, color: number, max: number) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  begin(): void { this.n = 0; }
  put(x: number, y: number, z: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n++, this.m.makeTranslation(x, y, z));
  }
  end(): void { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

/** 一组线段（辅助线） */
export function guideLines(parent: THREE.Object3D, points: number[], color: number): { object: THREE.LineSegments; dispose(): void } {
  const geo = new THREE.BufferGeometry(), mat = new THREE.LineBasicMaterial({ color });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const object = new THREE.LineSegments(geo, mat);
  parent.add(object);
  return { object, dispose: () => { object.removeFromParent(); geo.dispose(); mat.dispose(); } };
}

/** 打中时炸开的形状（默认是方块，也可以给别的，比如一个环）：从音符那么大放大、淡出。几个轮着用 */
export class Bursts {
  private readonly items: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; left: number }[] = [];
  private next = 0;

  /** @param ms 炸多久；grow 放大到几倍；count 同时最多几个；geo 炸开的形状（边长 / 直径 1，用完由这里销毁） */
  constructor(parent: THREE.Object3D, private readonly ms: number, private readonly grow: number, count: number, private readonly geo: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1)) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      parent.add(mesh);
      this.items.push({ mesh, left: 0 });
    }
  }

  /** 在这里炸一个：size = 一开始多大 */
  spawn(x: number, y: number, z: number, size: number, color: number): void {
    const it = this.items[this.next = (this.next + 1) % this.items.length];
    it.left = this.ms; it.mesh.userData.size = size;
    it.mesh.position.set(x, y, z);
    it.mesh.material.color.setHex(color);
    it.mesh.visible = true;
  }

  update(dtMs: number): void {
    for (const it of this.items) {
      if (it.left <= 0) continue;
      it.left -= dtMs;
      const k = 1 - Math.max(0, it.left) / this.ms;
      it.mesh.scale.setScalar((it.mesh.userData.size as number) * (1 + (this.grow - 1) * k));
      it.mesh.material.opacity = 0.7 * (1 - k);
      it.mesh.visible = it.left > 0;
    }
  }

  /** 都收掉（轮完这一段：没炸完的不留在场上） */
  clear(): void { this.items.forEach(it => { it.left = 0; it.mesh.visible = false; }); }

  dispose(): void { this.items.forEach(it => { it.mesh.removeFromParent(); it.mesh.material.dispose(); }); this.geo.dispose(); }
}

/**
 * 一张小画布当贴图：正中写一个字；disc 给了颜色就先画一个实心圆（带一圈边）当底。
 * px = 画布边长（像素），font = 字占画布的多少
 */
export function letterTexture(text: string, color: string, o: { px: number; font: number; disc?: { fill: string; edge: string } }): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = o.px;
  const g = c.getContext('2d')!, mid = o.px / 2;
  if (o.disc) {
    g.beginPath(); g.arc(mid, mid, mid * 0.92, 0, Math.PI * 2);
    g.fillStyle = o.disc.fill; g.fill();
    g.lineWidth = o.px * 0.07; g.strokeStyle = o.disc.edge; g.stroke();
  }
  g.font = `bold ${Math.round(o.px * o.font)}px monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, mid, mid + o.px * 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 飞出去的方块：从一处飞到另一处，边飞边转边缩小，到了叫一声 onArrive。几个轮着用 */
export class Flyers {
  private readonly items: { mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; from: THREE.Vector3; to: THREE.Vector3; left: number; size: number }[] = [];
  private readonly geo = new THREE.BoxGeometry(1, 1, 1);
  private next = 0;

  /** @param ms 飞多久；shrink 到了的时候缩到几成；count 同时最多几个 */
  constructor(parent: THREE.Object3D, private readonly ms: number, private readonly shrink: number, count: number, color: number, private readonly onArrive: () => void) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
      mesh.visible = false;
      parent.add(mesh);
      this.items.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), left: 0, size: 1 });
    }
  }

  launch(from: THREE.Vector3, to: THREE.Vector3, size: number): void {
    const it = this.items[this.next = (this.next + 1) % this.items.length];
    it.from.copy(from); it.to.copy(to); it.left = this.ms; it.size = size;
    it.mesh.visible = true;
  }

  update(dtMs: number): void {
    for (const it of this.items) {
      if (it.left <= 0) continue;
      it.left -= dtMs;
      const k = 1 - Math.max(0, it.left) / this.ms;
      it.mesh.position.lerpVectors(it.from, it.to, k);
      it.mesh.scale.setScalar(it.size * (1 + (this.shrink - 1) * k));
      it.mesh.rotation.set(k * 9, k * 7, 0);
      if (it.left <= 0) { it.mesh.visible = false; this.onArrive(); }
    }
  }

  clear(): void { this.items.forEach(it => { it.left = 0; it.mesh.visible = false; }); }
  dispose(): void { this.items.forEach(it => { it.mesh.removeFromParent(); it.mesh.material.dispose(); }); this.geo.dispose(); }
}
