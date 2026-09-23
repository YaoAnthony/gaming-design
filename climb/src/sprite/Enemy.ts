// ===== 怪物：巡逻，遇墙 / 遇悬崖掉头；尖刺伤不到它，可以穿过房间边界 =====
import Phaser from 'phaser';
import type { EnemySpawn } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  dir: 1 | -1 = -1;

  constructor(scene: Phaser.Scene, readonly spawn: EnemySpawn) {
    super(scene, spawn.x, spawn.y + 2, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(26, 22);
  }

  /** 巡逻：撞墙或前面没地就掉头。不受房间边界限制，路通就能走到隔壁房间（头上的纸跟着走） */
  step(terrain: Terrain, _roomPxW: number, speed: number): void {
    const b = this.body, T = terrain.T;
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    else if (b.blocked.down) {
      const frontX = Math.floor((this.dir > 0 ? b.right + 2 : b.left - 2) / T);
      const belowY = Math.floor((b.bottom + 2) / T);
      if (!terrain.isSolid(frontX, belowY)) this.dir = this.dir > 0 ? -1 : 1;
    }
    this.setVelocityX(this.dir * speed);
    this.setFlipX(this.dir > 0);
  }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }
}
