// ===== 火花弹幕：一圈穿墙的火花，不伤人，碰到引线端点就点燃它 =====
import Phaser from 'phaser';
import type { CellRef } from '@/type';

interface Spark { img: Phaser.GameObjects.Image; vx: number; vy: number; ttl: number }

export class SparkBurst {
  private sparks: Spark[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, count: number, speed: number, private tile: number, ttl: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const img = scene.add.image(x, y, 'spark').setDepth(11).setTint(0xc4a7ff).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD);
      this.sparks.push({ img, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ttl });
    }
  }

  get alive(): boolean { return this.sparks.length > 0; }

  /** 每帧推进；每颗火花所在的格子交给 onCell，返回 true 表示被吃掉（比如点燃了引线） */
  update(dt: number, onCell: (cell: CellRef) => boolean): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.img.x += s.vx * dt; s.img.y += s.vy * dt; s.ttl -= dt;
      s.img.setAlpha(Math.max(0, Math.min(1, s.ttl)));
      s.img.rotation += dt * 12;
      const cell = { x: Math.floor(s.img.x / this.tile), y: Math.floor(s.img.y / this.tile) };
      if (s.ttl <= 0 || onCell(cell)) { s.img.destroy(); this.sparks.splice(i, 1); }
    }
  }

  destroy(): void { this.sparks.forEach(s => s.img.destroy()); this.sparks = []; }
}
