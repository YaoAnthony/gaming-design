// ===== 3D 世界里的主角：3D asset/hero 的模型（方脑袋的小机器人），按站 / 跑 / 跳切动作，朝着走的方向，脚下一团影子 =====
// 模型是异步读进来的：读进来之前只有影子。接口上位置是脚底中心（和以前的贴图一样）。
import * as THREE from 'three';
import { HERO_PALETTE } from '@/shared/palette';
import { CharacterModel } from '@/stage3d/characters/CharacterModel';

/** 影子：比身宽大多少倍、多黑 */
const SHADOW = { scale: 1.3, opacity: 0.4 };
/** 影子比地面高一点点，免得和地面抢着画 */
const SHADOW_LIFT = 0.02;
/** 走得比这快就算在跑（格 / 秒）；转身用多久（秒） */
const RUN_SPEED = 0.5, TURN_SEC = 0.12;

export type HeroMotion = 'idle' | 'run' | 'jump';

export class Hero3D {
  /** 整个人：脚底中心在它的 position */
  readonly object = new THREE.Group();
  private model: CharacterModel | null = null;
  private readonly shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private motion: HeroMotion = 'idle';
  /** 朝哪（水平单位向量；模型自己朝 +z） */
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private yaw = 0;
  private scale = 1;
  private shown = true;
  private disposed = false;

  /** @param w,h 人的宽高（格）；lit = 用场景里的灯光照（3D 世界），否则按固定方向分档 */
  constructor(modelUrl: string, w: number, private readonly h: number, private readonly lit = false) {
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW.opacity, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(w * SHADOW.scale);
    this.object.add(this.shadow);
    CharacterModel.load(modelUrl, { palette: HERO_PALETTE, fallback: 'hero_head', lit }).then(m => {
      if (this.disposed) { m.dispose(); return; }
      this.model = m;
      m.setHeight(this.h * this.scale);
      m.root.visible = this.shown;
      m.play(this.motion, 0);
      this.object.add(m.root);
    }, err => console.error('主角的模型读不进来', err));
  }

  /** 人放在哪（脚底中心）、整个人缩放多少（走回画面时用） */
  place(x: number, y: number, z: number, scale = 1): void {
    this.object.position.set(x, y, z);
    this.scale = scale;
    this.model?.setHeight(this.h * scale);
  }

  /** 朝左还是朝右（x 方向）；动起来之后朝向跟着速度走（见 move） */
  face(dir: 1 | -1): void { this.heading.set(dir, 0, 0.3).normalize(); }

  /** 每帧：按速度挑动作、记朝向。grounded = 脚踩着东西 */
  move(vel: { x: number; y: number; z: number }, grounded: boolean): void {
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > RUN_SPEED) this.heading.set(vel.x / speed, 0, vel.z / speed);
    this.motion = !grounded ? 'jump' : speed > RUN_SPEED ? 'run' : 'idle';
  }

  /** 每帧推进动作、转身 */
  update(dtSec: number): void {
    const m = this.model;
    if (!m) return;
    m.play(this.motion, this.motion === 'jump' ? 0.08 : 0.15, this.motion === 'jump');
    m.update(dtSec);
    const target = Math.atan2(this.heading.x, this.heading.z);
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));   // 走最短的路
    const k = dtSec > 0 ? 1 - Math.exp(-dtSec / TURN_SEC) : 1;
    this.yaw += d * k;
    m.root.rotation.y = this.yaw;
  }

  /** 光从哪来（世界坐标，指向光源）；材质按镜头换算 */
  setLight(dirWorld: THREE.Vector3, camera: THREE.Camera, ambient: number, aoPower: number): void {
    this.model?.setLight(dirWorld, camera, ambient, aoPower);
  }

  /** 人现在在哪（脚底中心） */
  get position(): THREE.Vector3 { return this.object.position; }

  /** 整个人有多实（挨打后一闪一闪）：卡通材质没有半透明，一半以下就整个不画 */
  fade(opacity: number): void {
    this.shown = opacity >= 0.5;
    if (this.model) this.model.root.visible = this.shown;
  }

  /** 影子落在人正下方的地面上；groundY = null（脚下是空的）就不画。受灯光照的时候有真的投影，不画这团 */
  castShadow(groundY: number | null): void {
    this.shadow.visible = groundY !== null && !this.lit;
    if (groundY !== null) this.shadow.position.set(0, groundY - this.object.position.y + SHADOW_LIFT, 0);
  }

  dispose(): void {
    this.disposed = true;
    this.model?.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
