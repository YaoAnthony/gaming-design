// ===== 场景件的模型库：3D asset/props 导出的 props.glb（木框、桌面、木箱、木板、吊灯……）=====
// 每件东西在 glb 里是一个同名的节点，下面挂着几十个小零件（板条、钉子）。读进来之后按材质合并成一件几个 mesh
// （省绘制次数），之后要多少件就克隆多少件；LevelView 按关卡数据缩放摆放。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonPalettes } from '@/shared/palette';
import { CharacterModel } from '@/stage3d/characters/CharacterModel';

/** 克隆出来的一件：object 的原点按 origin 放（bottom = 底面中心，center = 正中，own = 模型自己的原点），size 是模型原本的尺寸（格） */
export interface Prop { object: THREE.Group; size: THREE.Vector3 }
export type PropOrigin = 'bottom' | 'center' | 'own';

interface Template { object: THREE.Group; box: THREE.Box3; size: THREE.Vector3 }

export interface PropSetOptions {
  /** 受场景灯光照（投影）还是按固定方向分档 */
  lit: boolean;
  /** 这些材质不受光、直接亮（灯泡） */
  unlit?: string[];
}

/** 木箱按高宽比挑哪一种：扁的 / 矮的 / 正方的 */
export function crateVariant(size: { x: number; y: number; z: number }): 'crate_flat' | 'crate_half' | 'crate_cube' {
  const k = size.y / Math.max(size.x, size.z);
  return k <= 0.45 ? 'crate_flat' : k <= 0.8 ? 'crate_half' : 'crate_cube';
}

export class PropSet {
  private readonly templates = new Map<string, Template>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly extra: THREE.Material[] = [];

  static async load(url: string, palette: ToonPalettes, o: PropSetOptions): Promise<PropSet> {
    const model = await CharacterModel.load(url, { palette, fallback: 'crate', lit: o.lit });
    return new PropSet(model, palette, o);
  }

  constructor(private readonly model: CharacterModel, palette: ToonPalettes, o: PropSetOptions) {
    model.scene.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    for (const root of model.scene.children) {
      inv.copy(root.matrixWorld).invert();
      const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
      root.traverse(ob => {
        if (!(ob instanceof THREE.Mesh)) return;
        const m = ob.material as THREE.Material;
        const g = ob.geometry.clone().applyMatrix4(inv.clone().multiply(ob.matrixWorld));
        (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(g);
      });
      const group = new THREE.Group();
      group.name = root.name;
      for (const [m, gs] of byMat) {
        const merged = mergeGeometries(gs, false);
        gs.forEach(g => g.dispose());
        if (!merged) continue;
        this.geometries.push(merged);
        let mat = m;
        if (o.unlit?.includes(m.name)) {
          mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette[m.name]?.colors[0] ?? '#ffffff'), fog: false });
          this.extra.push(mat);
        }
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = mesh.receiveShadow = o.lit && mat === m;
        group.add(mesh);
      }
      const box = new THREE.Box3().setFromObject(group);
      this.templates.set(root.name, { object: group, box, size: box.getSize(new THREE.Vector3()) });
    }
  }

  /** 有哪些件 */
  get names(): string[] { return [...this.templates.keys()]; }

  /** 克隆一件（几何和材质共用）。没有这件就返回 null */
  spawn(name: string, origin: PropOrigin = 'bottom'): Prop | null {
    const t = this.templates.get(name);
    if (!t) return null;
    const inner = t.object.clone();
    const c = t.box.getCenter(new THREE.Vector3());
    if (origin === 'bottom') inner.position.set(-c.x, -t.box.min.y, -c.z);
    else if (origin === 'center') inner.position.set(-c.x, -c.y, -c.z);
    const object = new THREE.Group();
    object.name = name;
    object.add(inner);
    return { object, size: t.size.clone() };
  }

  dispose(): void {
    this.geometries.forEach(g => g.dispose());
    this.extra.forEach(m => m.dispose());
    this.model.dispose();
  }
}
