// ===== 和场景里真实模型的碰撞：three-mesh-bvh（网格的包围体层次树）=====
// 关卡的方块（地面、箱子）还是 physics.ts 按方柱算；桌上的杂物（线轴、剪刀、罐子……）形状不规则，
// 把它们的三角形合成一棵 BVH，人当成一根胶囊体，每步结束后让库算最近点、把人顶出来。
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Body3D } from './physics';

/** 顶出来多少才算踩着 / 顶头（格） */
const EPS = 1e-4;

export class StaticCollider {
  private readonly bvh: MeshBVH;
  // 每步复用
  private readonly seg = new THREE.Line3();
  private readonly box = new THREE.Box3();
  private readonly onTri = new THREE.Vector3();
  private readonly onSeg = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly total = new THREE.Vector3();

  constructor(geometry: THREE.BufferGeometry) { this.bvh = new MeshBVH(geometry); }

  /** 把 root 下面所有 mesh 的三角形（按相对 root 的变换）合成一棵树；没有三角形返回 null */
  static fromObject(root: THREE.Object3D): StaticCollider | null {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4(), v = new THREE.Vector3();
    const out: number[] = [];
    root.traverse(ob => {
      if (!(ob instanceof THREE.Mesh)) return;
      const g = ob.geometry as THREE.BufferGeometry, pos = g.getAttribute('position'), idx = g.getIndex();
      rel.multiplyMatrices(inv, ob.matrixWorld);
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(rel);
        out.push(v.x, v.y, v.z);
      }
    });
    if (!out.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return new StaticCollider(g);
  }

  /** 人撞进模型里了就推出来；往上推了算踩着，往下推了算顶头，推的方向上的速度清零 */
  resolve(b: Body3D): void {
    const r = b.half;
    this.seg.start.set(b.pos.x, b.pos.y + r, b.pos.z);
    this.seg.end.set(b.pos.x, b.pos.y + Math.max(r, b.height - r), b.pos.z);
    this.box.makeEmpty().expandByPoint(this.seg.start).expandByPoint(this.seg.end);
    this.box.min.addScalar(-r); this.box.max.addScalar(r);
    this.total.set(0, 0, 0);
    this.bvh.shapecast({
      intersectsBounds: box => box.intersectsBox(this.box),
      intersectsTriangle: tri => {
        const d = tri.closestPointToSegment(this.seg, this.onTri, this.onSeg);
        if (d >= r) return false;
        if (d > EPS) this.delta.subVectors(this.onSeg, this.onTri).multiplyScalar((r - d) / d);
        else tri.getNormal(this.delta).multiplyScalar(r);
        this.seg.start.add(this.delta); this.seg.end.add(this.delta);
        this.total.add(this.delta);
        return false;
      },
    });
    const t = this.total;
    if (t.lengthSq() === 0) return;
    b.pos.x += t.x; b.pos.y += t.y; b.pos.z += t.z;
    if (t.y > EPS) { b.grounded = true; if (b.vel.y < 0) b.vel.y = 0; }
    else if (t.y < -EPS && b.vel.y > 0) b.vel.y = 0;
    if (t.x * b.vel.x < 0) b.vel.x = 0;
    if (t.z * b.vel.z < 0) b.vel.z = 0;
  }
}
