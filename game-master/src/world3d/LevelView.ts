// ===== 把一关的方块画出来：深色的实心方块 + 纸白的棱线；地面上一层格线 =====
import * as THREE from 'three';
import { Colors } from '@/shared/palette';
import type { Level3D } from './level';

/** 格线比地面高一点点，免得和地面抢着画 */
const GRID_LIFT = 0.01;

export class LevelView {
  readonly object = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(level: Level3D) {
    const fill = new THREE.MeshBasicMaterial({ color: Colors.deep });
    const edge = new THREE.LineBasicMaterial({ color: Colors.paper });
    this.disposables.push(fill, edge);
    for (const b of level.blocks) {
      const box = new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z);
      const edges = new THREE.EdgesGeometry(box);
      this.disposables.push(box, edges);
      const mesh = new THREE.Mesh(box, fill);
      mesh.position.set(b.at.x, b.at.y + b.size.y / 2, b.at.z);
      mesh.add(new THREE.LineSegments(edges, edge));
      this.object.add(mesh);
    }
    const ground = level.blocks[level.grid.block];
    if (ground) this.object.add(this.grid(ground.at.x, ground.at.y + ground.size.y + GRID_LIFT, ground.at.z, ground.size.x, ground.size.z, level.grid.cell));
  }

  /** 一块矩形上的格线 */
  private grid(cx: number, y: number, cz: number, w: number, d: number, cell: number): THREE.LineSegments {
    const pts: number[] = [];
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += cell) pts.push(cx + x, y, cz - d / 2, cx + x, y, cz + d / 2);
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += cell) pts.push(cx - w / 2, y, cz + z, cx + w / 2, y, cz + z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color: Colors.dim, transparent: true, opacity: 0.5 });
    this.disposables.push(g, m);
    return new THREE.LineSegments(g, m);
  }

  dispose(): void { this.disposables.forEach(d => d.dispose()); }
}
