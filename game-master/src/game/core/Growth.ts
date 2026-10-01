// ===== 长大的仪式：画面淡出、整张地图复原、人回到出生点，淡入后长高一阶再玩一次 =====
// 期间不响应输入、不会死（growing）。长大阶段：1 → 1.5 → 2 格
// 现在没有东西触发它：以前是出口的假通关（「进入下一关」），现在「进入下一关」直接跳到下一层，它留着，以后做成药水之类的道具时接上（begin）
import Phaser from 'phaser';
import type { GameConfig, Point } from '@/type';
import type { Mechanic } from '@/game/mechanics/define';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseNet } from '@/game/fuse/Fuse';
import type { Player } from '@/sprite';
import { MAX_STAGE, STAGE_EXTRA } from '@/sprite/Player';
import type { Enemies } from './Enemies';
import type { Respawn } from './Respawn';
import type { Rooms } from './Rooms';

export interface GrowthDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  rooms: Rooms;
  respawn: Respawn;
  terrain: Terrain;
  fuses: FuseNet;
  player: () => Player;
  enemies: () => Enemies;
  mechs: () => Mechanic[];
  spawnPoint: () => Point | null;
  /** 淡入后闪一下层名 */
  announce: () => void;
  fogDirty: () => void;
}

export class Growth {
  /** 仪式进行中：进场后先长大，长完才能动 */
  growing = false;
  private tween: Phaser.Tweens.Tween | null = null;
  /** 回到出生点的时刻：落地（或最多等 1 秒）后开始长；null = 还在淡出、没回到出生点 */
  private since: number | null = null;

  constructor(private readonly d: GrowthDeps) {}

  /** 还能再长一阶吗（已经 2 格高就不行） */
  get canGrow(): boolean { return !this.growing && this.d.player().stage < MAX_STAGE; }

  /** 开始仪式（调用方先确认 canGrow 和自己的状态） */
  begin(): void {
    const { scene, rooms, respawn, terrain, fuses, cfg } = this.d;
    this.growing = true; this.tween = null; this.since = null;
    const cam = scene.cameras.main;
    cam.fadeOut(350, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      respawn.clearTransient('world');
      terrain.resetRect(0, 0, terrain.w, terrain.h);
      fuses.resetRect(0, 0, terrain.w, terrain.h);
      this.d.enemies().resetAll();
      this.d.mechs().forEach(m => m.onReset?.('level'));
      // 出生点是格子中心：身体已经比一格高了，按脚底贴着那一格的底边放，别陷进地板
      const p = this.d.player(), spawn = this.d.spawnPoint() ?? respawn.entry, feet = spawn.y + cfg.tile / 2;
      respawn.moveEntry({ x: spawn.x, y: feet - p.displayHeight / 2, vx: 0, vy: 0 });
      this.d.mechs().forEach(m => m.onRoomChanged?.(rooms.current));   // 出生房间里有 Boss 之类的，重新开始
      this.d.fogDirty();
      // 放回出生点（骷髅手放下来，或者直接出现），落了地再冻住长大
      respawn.appear('level', () => { this.since = scene.time.now; });
      cam.fadeIn(350, 0, 0, 0);
      this.d.announce();
    });
  }

  /** 每帧：回到出生点、落了地（或最多等 1 秒）再开始长 */
  update(time: number): void {
    if (this.growing && this.since !== null && !this.tween && (this.d.player().onGround || time - this.since > 1000)) this.start();
  }

  /** 长大动画：冻住，长高一阶（多 STAGE_EXTRA 格）；长完把复活点记在长大后的身体中心（脚底不变），解冻继续玩 */
  private start(): void {
    const p = this.d.player();
    p.freeze(0xffffff); p.clearTint();
    const from = p.stage, to = Math.min(MAX_STAGE, from + 1);
    this.tween = this.d.scene.tweens.addCounter({
      from: from * STAGE_EXTRA, to: to * STAGE_EXTRA, delay: 500, duration: this.d.cfg.growMs, ease: 'Sine.easeInOut',
      onUpdate: tw => p.setGrowth(tw.getValue() ?? 0),
      onComplete: () => {
        p.setStage(to);
        this.growing = false; this.tween = null;
        this.d.respawn.entry = { x: p.x, y: p.y, vx: 0, vy: 0 };
        p.unfreeze();
      },
    });
  }
}
