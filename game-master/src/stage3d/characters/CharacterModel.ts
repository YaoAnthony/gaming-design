// ===== 3D 角色的通用读法：仓库根目录 3D asset/ 下用 woodkit 导出的 glb（骨架 + 部件 + 动作 + 对准点）=====
// 材质只认名字：按调色板换成卡通分档材质（和木手一样，顶点色里是烤好的环境光遮蔽）；动作按名字切、交叉过渡；
// 对准点（anchor_*）和部件都按名字找。模型自己的单位随便，用 height 把它缩放成想要的高度。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ToonPaletteMaterial, type ToonLight, type ToonPalette } from '@/stage3d/hand/ToonPaletteMaterial';
import { toonLitMaterial } from './litMaterial';

export interface CharacterOptions {
  /** 材质名 → 调色板；找不到的用 fallback 那个名字的 */
  palette: Record<string, ToonPalette>;
  fallback?: string;
  /** 不要的部件（按名字藏起来） */
  hide?: string[];
  /** 用场景里的灯光照（受聚光灯、投影、雾）；不写就是按固定方向分档、直接输出调色板颜色 */
  lit?: boolean;
}

export class CharacterModel {
  /** 整个角色：位置、朝向、缩放设在这上面 */
  readonly root = new THREE.Group();
  /** 静止姿势下的高度（模型单位） */
  readonly height: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: string | null = null;
  private readonly materials: THREE.Material[] = [];
  private readonly dirView = new THREE.Vector3();
  private readonly camInv = new THREE.Quaternion();

  static async load(url: string, o: CharacterOptions): Promise<CharacterModel> {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new CharacterModel(gltf.scene, gltf.animations, o);
  }

  constructor(readonly scene: THREE.Group, clips: THREE.AnimationClip[], o: CharacterOptions) {
    this.root.add(scene);
    const byName = new Map<string, THREE.Material>();
    scene.traverse(ob => {
      if (!(ob instanceof THREE.Mesh)) return;
      const old = ob.material as THREE.Material, name = old.name;
      let m = byName.get(name);
      if (!m) {
        const palette = o.palette[name] ?? o.palette[o.fallback ?? 'wood'] ?? Object.values(o.palette)[0];
        m = o.lit ? toonLitMaterial(palette.colors) : new ToonPaletteMaterial(palette);
        m.name = name;   // 之后还能按名字认出来（props 里的灯泡）
        byName.set(name, m);
        this.materials.push(m);
      }
      ob.material = m;
      old.dispose();
      ob.frustumCulled = false;   // 骨头在动，不按静止的包围盒剔除
      ob.castShadow = ob.receiveShadow = !!o.lit;
      if (o.hide?.includes(ob.name)) ob.visible = false;
    });
    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    this.height = box.max.y - box.min.y;
  }

  /** 有哪些动作 */
  get clips(): string[] { return [...this.actions.keys()]; }

  /** 切到某个动作（交叉过渡 fadeSec 秒）。once = 播一遍停在最后一帧（之后再 play 别的） */
  play(name: string, fadeSec = 0.15, once = false): void {
    if (name === this.current) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev && fadeSec > 0) prev.crossFadeTo(next, fadeSec, false);
    else prev?.stop();
    this.current = name;
  }

  /** 现在播的动作已经播完了（once 的） */
  finished(): boolean {
    const a = this.current ? this.actions.get(this.current) : undefined;
    return !a || (a.loop === THREE.LoopOnce && !a.isRunning());
  }

  get playing(): string | null { return this.current; }

  update(dtSec: number): void { this.mixer.update(dtSec); }

  /** 按名字找对准点 / 部件。GLTFLoader 会把名字里的点、空格去掉（anchor_hand.L → anchor_handL），这里按同样的规则找 */
  part(name: string): THREE.Object3D | undefined { return this.scene.getObjectByName(name.replace(/\s/g, '_').replace(/[^\w-]/g, '')); }

  /** 整个角色缩放到这么高 */
  setHeight(h: number): void { this.root.scale.setScalar(h / this.height); }

  /** 光从世界坐标的哪个方向来（指向光源）：材质要的是相机坐标，按镜头换算 */
  setLight(dirWorld: THREE.Vector3, camera: THREE.Camera, ambient: number, aoPower: number): void {
    this.camInv.copy(camera.quaternion).invert();
    this.dirView.copy(dirWorld).applyQuaternion(this.camInv);
    const l: ToonLight = { dir: [this.dirView.x, this.dirView.y, this.dirView.z], ambient, aoPower };
    for (const m of this.materials) if (m instanceof ToonPaletteMaterial) m.setLight(l);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
