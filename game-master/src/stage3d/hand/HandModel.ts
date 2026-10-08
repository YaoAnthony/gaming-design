// ===== Game Master 的木手模型：仓库根目录 3D asset/gm_hand/export_glb.py 导出的 glb =====
// 里面有：骨架（每根手指三节、手腕）、挂在骨头上的部件（每个部件的材质只认名字：wood / cuff / wrist / knot / frame / boss）、
// 四个姿势各一段动画（pose_open / pose_point / pose_pinch / pose_fist，只有骨骼）、对准点（anchor_tip 指尖、anchor_thumb 拇指尖、
// anchor_palm 手心、anchor_wrist 手腕）、一截前臂（GMH_arm，原点在靠护腕那头，沿 -x 拉长就伸到画面外）。
// 模型单位：1 = 10 个「手的像素」；手的长度（护腕后沿到指尖）从对准点量出来，外面按它缩放到页面像素。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HandPose } from '@/protocol';

export type HandAnchor = 'tip' | 'pinch' | 'palm';
const ANCHORS = ['tip', 'thumb', 'palm', 'wrist'] as const;
type AnchorName = typeof ANCHORS[number];

export class HandModel {
  /** 整只手：位置、朝向、镜像、放大都设在这上面 */
  readonly root = new THREE.Group();
  /** 手本体：每个姿势从镜头看的角度（绕手指方向转、翻面）设在这上面 */
  readonly body = new THREE.Group();
  /** 手的长度（模型单位）：静止姿势下护腕后沿到指尖 */
  readonly length: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<HandPose, THREE.AnimationAction>();
  private current: HandPose | null = null;
  private readonly anchors: Record<AnchorName, THREE.Object3D>;
  private readonly arm: THREE.Mesh;
  /** 前臂没拉长时多长（模型单位） */
  private readonly armLength: number;
  /** 指尖那节有多厚（半径，模型单位） */
  private readonly tipRadius: number;
  /** 每个部件和它的包围球半径（模型单位）：算整只手最靠前的深度用 */
  private readonly parts: [THREE.Mesh, number][] = [];
  private readonly tmp = new THREE.Vector3();

  static async load(url: string, material: (name: string) => THREE.Material): Promise<HandModel> {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new HandModel(gltf.scene, gltf.animations, material);
  }

  constructor(scene: THREE.Group, clips: THREE.AnimationClip[], material: (name: string) => THREE.Material) {
    this.body.add(scene);
    this.root.add(this.body);
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const old = o.material as THREE.Material;
      o.material = material(old.name);
      old.dispose();
      o.frustumCulled = false;   // 骨头在动，不按静止的包围盒剔除
      o.geometry.computeBoundingSphere();
      this.parts.push([o, o.geometry.boundingSphere!.radius]);
    });
    const find = (name: string): THREE.Object3D => {
      const o = scene.getObjectByName(name);
      if (!o) throw new Error(`木手模型里没有 ${name}（要用 3D asset/gm_hand/export_glb.py 重新导出）`);
      return o;
    };
    this.anchors = Object.fromEntries(ANCHORS.map(n => [n, find('anchor_' + n)])) as Record<AnchorName, THREE.Object3D>;
    this.arm = find('GMH_arm') as THREE.Mesh;
    this.arm.geometry.computeBoundingBox();
    const bb = this.arm.geometry.boundingBox!;
    this.armLength = bb.max.x - bb.min.x;
    const tip = find('GMH_index_3') as THREE.Mesh;
    tip.geometry.computeBoundingBox();
    const tb = tip.geometry.boundingBox!;
    this.tipRadius = Math.max(tb.max.x - tb.min.x, tb.max.z - tb.min.z) / 2;
    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of clips) {
      const pose = clip.name.replace(/^pose_/, '') as HandPose;
      this.actions.set(pose, this.mixer.clipAction(clip));
    }
    scene.updateMatrixWorld(true);
    this.length = this.anchors.tip.getWorldPosition(new THREE.Vector3()).x - this.anchors.wrist.getWorldPosition(this.tmp).x;
  }

  /** 换姿势：两个姿势之间交叉过渡 fadeSec 秒 */
  setPose(pose: HandPose, fadeSec: number): void {
    if (pose === this.current) return;
    const next = this.actions.get(pose);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset().play();
    if (prev && fadeSec > 0) prev.crossFadeTo(next, fadeSec, false);
    else prev?.stop();
    this.current = pose;
  }

  update(dtSec: number): void { this.mixer.update(dtSec); }

  /** 对准点现在在 root 本地的哪（模型单位，含姿势和 body 的转角）；捏合点 = 指尖和拇指尖的中点 */
  anchor(name: HandAnchor, out: THREE.Vector3): THREE.Vector3 {
    if (name === 'pinch') {
      this.anchors.tip.getWorldPosition(out);
      out.add(this.anchors.thumb.getWorldPosition(this.tmp)).multiplyScalar(0.5);
    } else {
      this.anchors[name].getWorldPosition(out);
    }
    return this.root.worldToLocal(out);
  }

  /**
   * 拎着的东西放在哪一层深度（世界坐标的 z）：比整只手都靠前——手是从后面捏着它的后领，指头都藏在它背后；
   * 放在指尖之间或指尖前面都不行，它比指头还小，拇指一压就把它整个挡住了
   */
  heldDepth(): number {
    const k = Math.abs(this.root.scale.z);
    let z = -Infinity;
    for (const [mesh, radius] of this.parts) z = Math.max(z, mesh.getWorldPosition(this.tmp).z + radius * k);
    return z + 0.5 * this.tipRadius * k;
  }

  /** 前臂靠护腕那头在 root 本地的哪（模型单位） */
  armOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.root.worldToLocal(this.arm.getWorldPosition(out));
  }

  /** 前臂拉到多长（模型单位，不会比原来短） */
  setArm(length: number): void { this.arm.scale.x = Math.max(1, length / this.armLength); }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
}
