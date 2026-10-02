// ===== 披风骷髅：在 3D 世界里攥屏幕的那一位（2D 里只看得见它伸进画面的手）=====
// 真的三维：身体是把 skeleton.png 一个像素一个小方块立起来，每一行按那一行的宽度鼓成椭圆（头是圆的、披风是厚的）；
// 手臂和手是一根根骨头（圆柱 + 骨节），上臂、前臂按肩膀和手腕的位置现算肘部，手指按握拳程度一节节弯过去扣住纸团。
// 只有上半身：从屏幕左边的地里探出来（屏幕底边那条线就是 3D 世界的地面），侧身朝着屏幕，靠镜头这边的手伸出去抓屏幕。用屏幕本地坐标（左上角原点、页面像素、y 朝下、z 朝屏幕外），跟着屏幕倾斜。
// 手的位置、角度、握拳程度由攥纸团的时间线每帧交进来，和 2D 里那只手是同一套动作。
import * as THREE from 'three';
import { IMAGES } from '@/asset';
import type { ScreenPlane } from '../../ScreenPlane';
import { handBones, type P3 } from './handBones';

const REAPER = {
  /** 只用贴图上面这么多行（头到腰，下面的埋在地里）；露出来的这截有多高（屏幕高的倍数） */
  rows: 26, height: 0.95,
  /** 身体中线在屏幕左边缘左边多远（屏幕高的倍数）；朝屏幕那边转多少度（0 = 正对镜头，90 = 正侧面） */
  left: 0.42, turn: 68,
  /** 每一行有多厚：那一行宽度的多少倍（椭圆的另一条轴）；最薄几个像素 */
  thickness: 0.85, minDepth: 2,
  /** 身体中线、手心离屏幕多远（纸团半径的倍数） */
  bodyZ: 1.6, palm: 1,
  /** 肩膀在贴图的哪个像素（转过来之后靠镜头的那一侧，披风开口处） */
  shoulder: [4, 15],
  /** 上臂、前臂各多长（屏幕宽的倍数）；肘往哪边弯（下、外）；前臂两根骨头离中线多远、上臂多粗（手那张贴图的像素） */
  armLength: 0.46, elbowBend: [0, 0.5, 1], forearmSpread: 14, armRadius: 6,
  /** 没伸手时手垂在肩膀的右边、下边多远（臂长的倍数） */
  rest: [0.5, 0.75],
  /** 骨头的颜色（和 grab_hand.png 一样）；骨节比骨头粗多少倍 */
  bone: 0xe8dfc9, knob: 1.2,
  /** 环境光、主光（从左上前方照过来）的强度 */
  ambient: 2.2, sun: 2.0, sunFrom: [-0.5, -1, 1.2],
} as const;
/** 贴图里透明度低于这个的像素不算身体 */
const ALPHA_CUT = 128;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface ReaperPose {
  /** 拳心在哪（屏幕本地坐标）、手转多少度、放大多少、握拳程度（0 张开 … 1 握拳） */
  x: number;
  y: number;
  angle: number;
  scale: number;
  curl: number;
  /** 出场：从地里升起来的程度 0..1 */
  rise: number;
  /** 退场：有多实 1..0（淡出） */
  opacity: number;
}

export class Reaper {
  private readonly group = new THREE.Group();
  /** 原点在脚下的地面上：出场时从这往上长 */
  private readonly rig = new THREE.Group();
  private body: THREE.InstancedMesh | null = null;
  private readonly bones: THREE.InstancedMesh;
  private readonly knobs: THREE.InstancedMesh;
  private readonly material = new THREE.MeshLambertMaterial();
  private readonly boneMaterial = new THREE.MeshLambertMaterial({ color: REAPER.bone });
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  /** 身体：原点在腰（地面上）的中线，侧身转向屏幕 */
  private readonly torso = new THREE.Group();
  /** 身体一个像素多大（页面像素）、肩膀（rig 里的坐标） */
  private readonly pixel: number;
  private readonly shoulder = new THREE.Vector3();
  private readonly floorY: number;
  private readonly arm: number;
  private disposed = false;
  // 每帧复用
  private readonly m = new THREE.Matrix4();
  private readonly hand = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  private readonly vs = new THREE.Vector3();

  /**
   * @param handScale 手那张贴图的一个像素放大成多少页面像素
   * @param ballRadius 纸团半径（页面像素）
   */
  constructor(screen: ScreenPlane, private readonly handScale: number, private readonly ballRadius: number) {
    const size = screen.size, skeleton = IMAGES.find(i => i.key === 'skeleton') ?? IMAGES[0];
    this.floorY = size.h;
    this.arm = REAPER.armLength * size.w;
    this.pixel = REAPER.height * size.h / REAPER.rows;
    this.torso.position.set(-REAPER.left * size.h, 0, REAPER.bodyZ * ballRadius);
    this.torso.rotation.y = THREE.MathUtils.degToRad(REAPER.turn);
    this.placeShoulder(28);   // 贴图读进来之前先按 28 像素宽估（skeleton.png 的宽），读进来再按真的摆
    new THREE.ImageLoader().load(skeleton.url, img => { if (!this.disposed) this.buildBody(img); });

    const sample = handBones(0);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), this.boneMaterial, sample.bones.length + 3);
    this.knobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.boneMaterial, sample.knobs.length + 3);
    this.bones.frustumCulled = false; this.knobs.frustumCulled = false;   // 每帧在动，不算包围盒

    const sun = new THREE.DirectionalLight(0xffffff, REAPER.sun);
    sun.position.set(REAPER.sunFrom[0], REAPER.sunFrom[1], REAPER.sunFrom[2]).multiplyScalar(size.h);
    this.rig.add(this.torso, this.bones, this.knobs);
    this.rig.position.y = this.floorY;
    this.group.add(this.rig, new THREE.AmbientLight(0xffffff, REAPER.ambient), sun, sun.target);
    this.group.visible = false;
    screen.attach(this.group);
  }

  /** 没伸手时拳心在哪（屏幕本地坐标）：手从这伸出去，松手后收回这 */
  get rest(): { x: number; y: number } {
    return { x: this.shoulder.x + REAPER.rest[0] * this.arm, y: this.floorY + this.shoulder.y + REAPER.rest[1] * this.arm };
  }

  private placeShoulder(imgW: number): void {
    const u = this.pixel;
    this.torso.updateMatrix();
    this.shoulder.set((REAPER.shoulder[0] + 0.5 - imgW / 2) * u, -(REAPER.rows - REAPER.shoulder[1] - 0.5) * u, 0).applyMatrix4(this.torso.matrix);
  }

  /** 把贴图上半截一个像素一个方块立起来：每一行按那一行的宽度鼓成椭圆，中线最厚、两边薄 */
  private buildBody(img: HTMLImageElement): void {
    const w = img.width, h = Math.min(img.height, REAPER.rows);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, w, h).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] >= ALPHA_CUT;
    /** 每一行实心的范围 [最左, 最右]；空行是 null */
    const spans = Array.from({ length: h }, (_, y) => {
      let x0 = -1, x1 = -1;
      for (let x = 0; x < w; x++) if (solid(x, y)) { if (x0 < 0) x0 = x; x1 = x; }
      return x0 < 0 ? null : [x0, x1] as const;
    });
    const depthAt = (x: number, y: number) => {
      const [x0, x1] = spans[y]!, half = (x1 - x0 + 1) / 2, t = (x + 0.5 - x0 - half) / half;
      return Math.max(REAPER.minDepth, REAPER.thickness * half * 2 * Math.sqrt(Math.max(0, 1 - t * t)));
    };
    this.placeShoulder(w);
    const u = this.pixel, cells: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) cells.push({ x, y });
    const body = new THREE.InstancedMesh(this.box, this.material, cells.length);
    const color = new THREE.Color(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion();
    cells.forEach(({ x, y }, i) => {
      const o = (y * w + x) * 4;
      pos.set((x + 0.5 - w / 2) * u, -(REAPER.rows - y - 0.5) * u, 0);
      scale.set(u, u, depthAt(x, y) * u);
      body.setMatrixAt(i, this.m.compose(pos, q, scale));
      body.setColorAt(i, color.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace));
    });
    body.frustumCulled = false;
    this.body = body;
    this.torso.add(body);
  }

  set(p: ReaperPose): void {
    const k = Math.max(0, Math.min(1, p.rise)), alpha = Math.max(0, Math.min(1, p.opacity));
    this.group.visible = k > 0 && alpha > 0;
    if (!this.group.visible) return;
    this.rig.scale.y = k;   // 从地里升起来：腰不动，往上长
    for (const m of [this.material, this.boneMaterial]) {
      if (m.transparent !== alpha < 1) { m.transparent = alpha < 1; m.needsUpdate = true; }
      m.opacity = alpha;
    }

    // 手：拳心在 (x, y)，手心离屏幕一个纸团半径；手这张「贴图」的像素按 handScale 放大
    const s = this.handScale * p.scale;
    this.hand.compose(this.va.set(p.x, p.y - this.floorY, REAPER.palm * this.ballRadius), this.q.setFromAxisAngle(this.vb.set(0, 0, 1), THREE.MathUtils.degToRad(p.angle)), this.vs.set(s, s, s));
    const h = handBones(p.curl);
    let bi = 0, ki = 0;
    const world = (pt: P3, out: THREE.Vector3) => out.set(pt[0], pt[1], pt[2]).applyMatrix4(this.hand);
    for (const b of h.bones) this.bone(bi++, world(b.a, this.va), world(b.b, this.vb), b.r * s);
    for (const n of h.knobs) this.knob(ki++, world(n.at, this.va), n.r * s);

    // 手臂：肩膀到手腕，肘往下、往外弯；上臂一根，前臂两根（桡骨、尺骨）接在手腕两头
    const wristA = world(h.wrists[0], new THREE.Vector3()), wristB = world(h.wrists[1], new THREE.Vector3());
    const wrist = this.vc.copy(wristA).add(wristB).multiplyScalar(0.5);
    const elbow = this.elbow(this.shoulder, wrist), r = REAPER.armRadius * s;
    const spread = this.va.copy(wristA).sub(wristB).normalize().multiplyScalar(REAPER.forearmSpread * s);
    this.bone(bi++, this.shoulder, elbow, r * 1.3);
    this.bone(bi++, this.vb.copy(elbow).add(spread), wristA, r);
    this.bone(bi, this.vb.copy(elbow).sub(spread), wristB, r);
    this.knob(ki++, this.shoulder, r * 1.6);
    this.knob(ki++, this.vb.copy(elbow).add(spread), r * 1.3);
    this.knob(ki, this.vb.copy(elbow).sub(spread), r * 1.3);
    this.bones.instanceMatrix.needsUpdate = true; this.knobs.instanceMatrix.needsUpdate = true;
  }

  /** 肘在哪：上臂、前臂一样长；够不着就伸直（骨头会跟着拉长一点） */
  private elbow(shoulder: THREE.Vector3, wrist: THREE.Vector3): THREE.Vector3 {
    const mid = new THREE.Vector3().addVectors(shoulder, wrist).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(wrist, shoulder), half = along.length() / 2;
    if (half >= this.arm || half < 1e-6) return mid;
    along.normalize();
    const bend = new THREE.Vector3(REAPER.elbowBend[0], REAPER.elbowBend[1], REAPER.elbowBend[2]);
    bend.addScaledVector(along, -bend.dot(along)).normalize();   // 只留和手臂垂直的那部分
    return mid.addScaledVector(bend, Math.sqrt(this.arm * this.arm - half * half));
  }

  private bone(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, len > 1e-6 ? dir.divideScalar(len) : Y_AXIS);
    this.bones.setMatrixAt(i, this.m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)));
  }

  private knob(i: number, at: THREE.Vector3, r: number): void {
    const k = r * REAPER.knob;
    this.knobs.setMatrixAt(i, this.m.makeScale(k, k, k).setPosition(at));
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    this.body?.dispose(); this.bones.dispose(); this.knobs.dispose();
    this.box.dispose(); this.bones.geometry.dispose(); this.knobs.geometry.dispose();
    this.material.dispose(); this.boneMaterial.dispose();
  }
}
