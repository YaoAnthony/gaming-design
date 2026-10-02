// ===== 主角跳出画面（游戏这一侧）：把人藏起来交给 3D 世界，人走回画面时再放出来 =====
// 收到请求先记着，等人归玩家管的时候（没死、没在出场动画里……）才跳。人不在的时候游戏照常跑，只是没有人可以操作。
import type Phaser from 'phaser';
import { bridge, EVT, type HeroEntryQuery, type HeroHandoff, type ScreenSpot } from '@/protocol';
import { landingSpot } from './popOutSpot';
import type { Player } from '@/sprite';

export interface PopOutDeps {
  scene: Phaser.Scene;
  player: () => Player;
  /** 一格砖多少像素 */
  tile: number;
  /** 现在能不能跳出去（人归玩家管） */
  canLeave: () => boolean;
  /** 这一格被挡住了（实心地形、机制的实心物件）：人走回画面时不能落在里面 */
  blocked: (cx: number, cy: number) => boolean;
  /** 这一格碰了会受伤（尖刺）：能不落在里面就不落 */
  hazard: (cx: number, cy: number) => boolean;
}

export class PopOut {
  /** 人不在画面里（在 3D 世界） */
  away = false;
  private pending = false;
  /** 从画面的哪跳出去（人的中心，游戏世界的像素）；null = 人现在站的地方 */
  private from: { x: number; y: number } | null = null;

  constructor(private readonly d: PopOutDeps) {}

  /**
   * 请求跳出去；没有 3D 舞台接手（没人听 heroLeft）就不跳。
   * from = 从画面的哪跳出去（节奏关卡里画面上动的是替身，要从替身那跳）；不给就是人现在站的地方
   */
  request(from?: { x: number; y: number }): void {
    if (this.away || bridge.listenerCount(EVT.heroLeft) === 0) return;
    this.pending = true; this.from = from ?? null;
  }

  /** 每帧：有请求、又能跳了，就跳 */
  update(): void {
    if (!this.pending || !this.d.canLeave()) return;
    this.pending = false;
    const p = this.d.player(), cam = this.d.scene.cameras.main, at = this.from ?? p;
    const handoff: HeroHandoff = {
      x: (at.x - cam.scrollX) / cam.width, y: (at.y - cam.scrollY) / cam.height,
      w: p.displayWidth / cam.width, h: p.displayHeight / cam.height,
      facing: p.flipX ? -1 : 1,
      texture: p.texture.key,
      tile: this.d.tile / cam.width,
    };
    this.away = true;
    p.freeze(0xffffff); p.clearTint(); p.setVisible(false);   // 帽子、手上的东西跟着人的 visible 藏
    bridge.emit(EVT.heroLeft, handoff);
  }

  /** 人要从画面的这个位置走回来：实际落在哪（那里是墙就挪到最近的空地；整个房间都站不下就不填，回原地） */
  answerEntry(q: HeroEntryQuery): void {
    if (!this.away) return;
    const p = this.d.player(), cam = this.d.scene.cameras.main, T = this.d.tile;
    const spot = landingSpot({
      want: { x: cam.scrollX + q.want.x * cam.width, y: cam.scrollY + q.want.y * cam.height },
      bodyW: p.body.width, bodyH: p.body.height, tile: T,
      room: { x0: Math.round(cam.scrollX / T), y0: Math.round(cam.scrollY / T), w: Math.round(cam.width / T), h: Math.round(cam.height / T) },
      blocked: this.d.blocked, hazard: this.d.hazard,
    });
    if (spot) q.answer = { x: (spot.x - cam.scrollX) / cam.width, y: (spot.y - cam.scrollY) / cam.height };
  }

  /** 人走回画面了：放出来。at = 落在画面的哪（answerEntry 给的），null = 原地 */
  comeBack(at: ScreenSpot | null): void {
    if (!this.away) return;
    this.away = false;
    const p = this.d.player(), cam = this.d.scene.cameras.main;
    p.setVisible(true);
    if (at) p.respawn({ x: cam.scrollX + at.x * cam.width, y: cam.scrollY + at.y * cam.height, vx: 0, vy: 0 });
    else p.unfreeze();
  }
}
