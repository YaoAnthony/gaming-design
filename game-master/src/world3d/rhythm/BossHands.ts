// ===== 骷髅王伸到画面外面来的两只手（3D）=====
// 到了 3D，画面里的骷髅王离得远了，东西改由他的两只大骨手放出来：手从屏幕那头伸过来，悬在大道远端的上空，
// 每个音符出发的那一刻，管那半边的手挪到那条道的上方、往下一松，音符就从手底下出去。
// 手的骨架和攥屏幕的那只是同一副（stage3d/fx/crumple/handBones）：一根根骨头，手指会一节节弯。
import * as THREE from 'three';
import { handBones, type P3 } from '@/stage3d/fx/crumple/handBones';

/**
 * 手：骨架的一个像素放大成多少格；悬在道面上方多高、离屏幕多远（格）；平时在自己那半边的哪（道宽的倍数，从中线算）；
 * 前臂往屏幕那头伸多长（骨架的像素）、多粗；骨头的颜色；骨节比骨头粗多少倍
 */
const HAND = { scale: 0.075, height: 9, z: 3.5, restX: 1, arm: 260, armRadius: 9, color: 0xe8dfc9, knob: 1.2 };
/** 放东西的那一下：手往下沉多少（格）、整个动作多久（毫秒）；平时握着（握拳程度），松手时张开到多少；手挪过去的快慢（毫秒） */
const DROP = { dip: 3, ms: 260, held: 0.75, open: 0.05, moveMs: 90 };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 一只骨手：按握拳程度摆骨头，整只手放在哪、朝哪由一个矩阵定 */
class BoneHand {
  private readonly bones: THREE.InstancedMesh;
  private readonly knobs: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(parent: THREE.Object3D, material: THREE.Material, boneGeo: THREE.BufferGeometry, knobGeo: THREE.BufferGeometry) {
    const sample = handBones(0);
    this.bones = new THREE.InstancedMesh(boneGeo, material, sample.bones.length + 2);
    this.knobs = new THREE.InstancedMesh(knobGeo, material, sample.knobs.length);
    this.bones.frustumCulled = false; this.knobs.frustumCulled = false;   // 每帧在动，不算包围盒
    parent.add(this.bones, this.knobs);
  }

  /** frame = 骨架坐标（原点在拳心、单位是像素）到世界的变换；scale = 一个像素多大 */
  pose(frame: THREE.Matrix4, scale: number, curl: number): void {
    const h = handBones(curl);
    const at = (p: P3, out: THREE.Vector3) => out.set(p[0], p[1], p[2]).applyMatrix4(frame);
    let i = 0;
    for (const bone of h.bones) this.bone(i++, at(bone.a, this.a), at(bone.b, this.b), bone.r * scale);
    // 前臂两根骨头：从手腕往手背后面（骨架的 -x）伸出去
    for (const wrist of h.wrists) this.bone(i++, at(wrist, this.a), at([wrist[0] - HAND.arm, wrist[1], wrist[2]], this.b), HAND.armRadius * scale);
    h.knobs.forEach((n, k) => { const r = n.r * scale * HAND.knob; this.knobs.setMatrixAt(k, this.m.makeScale(r, r, r).setPosition(at(n.at, this.a))); });
    this.bones.instanceMatrix.needsUpdate = true; this.knobs.instanceMatrix.needsUpdate = true;
  }

  private bone(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const len = this.dir.subVectors(b, a).length();
    this.q.setFromUnitVectors(Y_AXIS, len > 1e-6 ? this.dir.divideScalar(len) : Y_AXIS);
    this.bones.setMatrixAt(i, this.m.compose(a.clone().add(b).multiplyScalar(0.5), this.q, this.s.set(r, len, r)));
  }

  set visible(on: boolean) { this.bones.visible = on; this.knobs.visible = on; }
  dispose(): void { this.bones.removeFromParent(); this.knobs.removeFromParent(); this.bones.dispose(); this.knobs.dispose(); }
}

export class BossHands {
  private readonly material = new THREE.MeshBasicMaterial({ color: HAND.color });
  private readonly boneGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  private readonly knobGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly hands: BoneHand[];
  /** 每只手：现在在哪（x）、要去哪、上一次放东西是什么时候（毫秒，按真实时间） */
  private readonly state: { x: number; to: number; droppedAt: number }[];
  /** 骨架坐标 → 手的朝向：指尖（骨架的 +x）朝镜头（+z），手心（骨架的 -z）朝下，所以手背（+z）朝上 */
  private readonly basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  private readonly frame = new THREE.Matrix4();
  private clock = 0;

  /** @param laneW 一条道多宽（格）：两只手平时各在自己那半边 */
  constructor(parent: THREE.Object3D, laneW: number) {
    this.hands = [0, 1].map(() => new BoneHand(parent, this.material, this.boneGeo, this.knobGeo));
    this.state = [-1, 1].map(side => ({ x: side * HAND.restX * laneW, to: side * HAND.restX * laneW, droppedAt: -Infinity }));
  }

  /** 在这个 x（道的中线）上放一个东西出去：管那半边的手挪过去、往下一松 */
  drop(x: number): void {
    const s = this.state[x < 0 ? 0 : 1];
    s.to = x; s.droppedAt = this.clock;
  }

  /** 每帧。show = 手伸出来了几成（0 = 还缩在屏幕里，1 = 完全伸出来）：进场、离场时用 */
  update(dtMs: number, show: number): void {
    this.clock += dtMs;
    const k = 1 - Math.exp(-dtMs / DROP.moveMs);
    this.state.forEach((s, i) => {
      s.x += (s.to - s.x) * k;
      const since = this.clock - s.droppedAt, t = since >= 0 && since < DROP.ms ? since / DROP.ms : 1;
      const dip = Math.sin(Math.PI * t) * DROP.dip, curl = DROP.held + (DROP.open - DROP.held) * Math.sin(Math.PI * t);
      // 没伸出来的时候缩在屏幕那头（z 往后退、往上抬）
      this.frame.copy(this.basis).scale(new THREE.Vector3(HAND.scale, HAND.scale, HAND.scale))
        .setPosition(s.x, HAND.height - dip + (1 - show) * 6, HAND.z - (1 - show) * 14);
      this.hands[i].visible = show > 0.02;
      this.hands[i].pose(this.frame, HAND.scale, curl);
    });
  }

  dispose(): void { this.hands.forEach(h => h.dispose()); this.material.dispose(); this.boneGeo.dispose(); this.knobGeo.dispose(); }
}
