// ===== 开打前的引子：骷髅王弹一下琴键放一块板，一块块落在主角前面；这时候主角还是自由的 =====
// 板是真的能踩的（静态刚体）。主角跳上哪一块，哪一块就是 Give It Up 的起点：那一瞬间他被锁进节奏关卡，曲子开始。
import Phaser from 'phaser';
import type { Player } from '@/sprite';
import { drawPillar, PILLAR } from './modes/giveup';

/** 放几块；隔多久放一块、一块飞多久（毫秒）；踩上去的判定：脚离板顶最多差几像素 */
const LURE = { count: 4, everyMs: 450, flyMs: 520, feetPx: 6 };

export interface LureDeps {
  scene: Phaser.Scene;
  player: Player;
  tile: number;
  ground: number;
  depth: number;
  /** 第一块落在哪（x，板的正中）；往右一块块排过去 */
  startX: number;
  /** 板从哪飞出来（骷髅王的手边） */
  from: () => { x: number; y: number };
  /** 开始放第 i 块的那一刻（骷髅王敲一下琴键） */
  onThrow(i: number): void;
}

export class Lure {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly slabs: { x: number; body: Phaser.GameObjects.Rectangle | null; thrown: boolean }[];
  private readonly colliders: Phaser.Physics.Arcade.Collider[] = [];
  private readonly t0: number;

  constructor(private readonly d: LureDeps) {
    this.g = d.scene.add.graphics().setDepth(d.depth);
    this.t0 = d.scene.time.now;
    this.slabs = Array.from({ length: LURE.count }, (_, i) => ({ x: d.startX + i * PILLAR.gap * d.tile, body: null, thrown: false }));
  }

  /** 每帧。主角踩上了哪一块就返回它：x = 板的正中，left / right = 它左边、右边各有几块已经落好了；还没踩上是 null */
  update(): { x: number; left: number; right: number } | null {
    const { scene, tile: T, ground, player: p } = this.d, real = scene.time.now;
    const w = PILLAR.width * T, h = PILLAR.base * T, top = ground - h;
    this.g.clear();
    let stood = -1;
    this.slabs.forEach((s, i) => {
      const since = real - this.t0 - i * LURE.everyMs;
      if (since < 0) return;
      if (!s.thrown) { s.thrown = true; this.d.onThrow(i); }
      const u = Phaser.Math.Clamp(since / LURE.flyMs, 0, 1);
      drawPillar(this.g, T, ground, s.x, h, this.d.from(), u, 'plain');
      if (u < 1) return;
      if (!s.body) {   // 落好了：能踩了
        s.body = scene.add.rectangle(s.x, top + h / 2, w, h).setVisible(false);
        scene.physics.add.existing(s.body, true);
        this.colliders.push(scene.physics.add.collider(p, s.body));
      }
      const b = p.body;
      if ((b.touching.down || b.blocked.down) && Math.abs(b.bottom - top) <= LURE.feetPx && Math.abs(p.x - s.x) <= w / 2 + b.halfWidth) stood = i;
    });
    if (stood < 0) return null;
    const landed = (i: number) => this.slabs[i].body !== null;
    return {
      x: this.slabs[stood].x,
      left: this.slabs.filter((_, i) => i < stood && landed(i)).length,
      right: this.slabs.filter((_, i) => i > stood && landed(i)).length,
    };
  }

  destroy(): void {
    this.colliders.forEach(c => c.destroy());
    this.slabs.forEach(s => s.body?.destroy());
    this.g.destroy();
  }
}
