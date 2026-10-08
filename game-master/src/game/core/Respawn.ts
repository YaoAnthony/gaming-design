// ===== 死亡与重置：复活点、死、复活（默认什么都不重置）、R 重置房间 / 整张图、人重新出现 =====
// 场景里"人在哪重新出现、什么时候不响应输入"的状态都在这：dead、respawning、entry。
// 重置的顺序：清掉正在发生的东西 → 地形、引线、怪物、各机制恢复 → 人回到复活点（骷髅手放进来或直接出现）
// 地形、引线恢复到的是房间的复原点：没解开的房间是一开始的样子，解开过的是解开时的样子（core/Solves.ts）
import Phaser from 'phaser';
import type { AppearReason, EntryState, GameConfig, RoomCoord } from '@/type';
import type { MsgKey, DeathKey } from '@/i18n/keys';
import type { Mechanic } from '@/game/mechanics/define';
import type { Terrain } from '@/game/terrain/Terrain';
import type { FuseNet } from '@/game/fuse/Fuse';
import type { Player } from '@/sprite';
import type { SparkEmitter } from '@/particle';
import type { Enemies } from './Enemies';
import type { Debris } from './Debris';
import type { Dialogue } from './Dialogue';
import type { Rooms } from './Rooms';
import { playRespawnHand } from './respawnHand';
import { HeroShatter } from './heroShatter';
import { Colors, hex } from '@/shared/palette';

export interface RespawnDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  rooms: Rooms;
  terrain: Terrain;
  fuses: FuseNet;
  dialogue: Dialogue;
  sparks: SparkEmitter;
  player: () => Player;
  enemies: () => Enemies;
  debris: () => Debris;
  mechs: () => Mechanic[];
  /** 正在换层 / 长大：这时候不会死 */
  busy: () => boolean;
  flash: (text: MsgKey | DeathKey, color: string) => void;
  fogDirty: () => void;
  /** HUD 的模式：死了 / 又能玩了 */
  setMode: (mode: 'playing' | 'dead') => void;
  /** 人回到复活点（复活、R、重置整张图）：生命值回满之类 */
  onRespawn?: () => void;
  /** 人不在画面里（在 3D 世界）：重置后回到复活点接着藏着，不出场 */
  away: () => boolean;
  /** 重置之前：刚解开、还在等安静下来的房间先记下来（Solves.flush），不然解开的东西被这次重置冲掉 */
  beforeReset?: () => void;
}

export class Respawn {
  dead = false;
  private diedAt = 0;
  /** 出场动画中（骷髅手把人放进来）或藏着等淡入：人冻着，不响应输入、R，也不会死 */
  respawning = false;
  /** 复活点：重置时回到这里（Boss 封门时会改它） */
  entry: EntryState = { x: 0, y: 0, vx: 0, vy: 0 };
  private prevEntry: EntryState | null = null;
  private lastResetAt: number | null = null;

  /** 死的时候主角炸成碎块（复活时碎块淡出） */
  private readonly shatter: HeroShatter;

  constructor(private readonly d: RespawnDeps) {
    this.shatter = new HeroShatter(d.scene, d.terrain);
  }

  /** 进入新房间：记录入口状态（位置 + 速度），重置时回到这里 */
  onRoomChanged(r: RoomCoord): void {
    const { rooms, cfg } = this.d, p = this.d.player(), T = cfg.tile;
    // 重置点 = 进来的第一格的中心（离边缘半格）：人不到一格宽，整个在房间里；再往里就会落到第二格，那里可能是陷阱。
    // Boss 房封门时会自己把复活点改到封门处，不用在这里为它留余量
    // 骑在怪物驮着的纸上（或飘落的纸上）进来的：入口悬在它的路上（多半是尖刺河），在这里复活只会接着死；
    // 来回骑过边界时两边的入口都这样，「退回上一个入口」也救不了。复活点留在上一个房间
    if (!this.d.debris().ridingPaper()) {
      const nx = Phaser.Math.Clamp(p.x, r.rx * rooms.pxW + T * 0.5, (r.rx + 1) * rooms.pxW - T * 0.5);
      const ny = Phaser.Math.Clamp(p.y, r.ry * rooms.pxH + T * 0.5, (r.ry + 1) * rooms.pxH - T * 0.5);
      this.prevEntry = this.entry;
      this.entry = { x: nx, y: ny, vx: p.body.velocity.x, vy: p.body.velocity.y };
    }
    rooms.enter(r, false);
    this.d.mechs().forEach(m => m.onRoomChanged?.(r));
  }

  /** 换了复活点（整张图重置时机制改的，比如 Boss 重演）：跳到它所在的房间 */
  moveEntry(e: EntryState): void {
    this.entry = e; this.prevEntry = null;
    const { rooms } = this.d, r = rooms.of(e.x, e.y);
    if (!rooms.same(r, rooms.current)) rooms.enter(r, true);
  }

  /**
   * 重置前把"正在发生"的东西清掉：对话、镜头、火花，以及各机制的临时物体。
   * 整张图重置还清掉所有计时器和碎块平台；只重置一个房间时，别的房间里正在烧的引线、在掉的碎块、被驮着的纸照常进行
   * （地形和引线的计时器由它们自己的 resetRect 按房间取消，机制的计时器由机制在 onClear 里自己取消）
   */
  clearTransient(scope: 'room' | 'world'): void {
    const { scene, rooms } = this.d;
    this.d.dialogue.end();
    this.d.mechs().forEach(m => m.onClear?.());
    if (scope === 'world') scene.time.removeAllEvents();
    scene.tweens.killTweensOf(scene.cameras.main);
    scene.cameras.main.shakeEffect.reset();
    this.d.sparks.killAll();
    if (scope === 'world') this.d.debris().clear();
    else { const { x0, y0 } = rooms.cellOrigin(); this.d.debris().clearRoom(x0, y0, rooms.w, rooms.h); }
  }

  /** R：当前房间的地形、引线、怪物恢复，玩家回到入口。revive = 死了之后的复活；appearDelayMs = 人多久之后才由骷髅手放进来（这段时间藏着，等画面淡入） */
  resetRoom(revive = false, appearDelayMs = 0): void {
    const { rooms, terrain, fuses } = this.d;
    this.d.beforeReset?.();
    this.clearTransient('room');
    const { x0, y0 } = rooms.cellOrigin();
    terrain.resetRect(x0, y0, rooms.w, rooms.h);
    fuses.resetRect(x0, y0, rooms.w, rooms.h);
    this.d.enemies().resetRoom(rooms.current);
    this.d.mechs().forEach(m => m.onReset?.('room'));
    this.respawn('msg.roomReset', revive ? 'death' : 'reset', appearDelayMs);
  }

  /**
   * 重置整张地图（死亡、按 R，config.deathReset = 'world' 时）：所有房间的地形、引线、怪物、箱子、钥匙恢复，开过的门关回来，
   * 玩家回到重置点；探索记忆保留。机制可以改复活点（Boss 重演）。appearDelayMs 同 resetRoom
   */
  resetWorld(revive = false, appearDelayMs = 0): void {
    const { terrain, fuses } = this.d;
    this.d.beforeReset?.();
    this.d.rooms.sleepAll();   // 别的房间重新睡着：等玩家再进去才动
    this.clearTransient('world');
    terrain.resetRect(0, 0, terrain.w, terrain.h);
    fuses.resetRect(0, 0, terrain.w, terrain.h);
    this.d.enemies().resetAll();
    let moved: EntryState | null = null;
    this.d.mechs().forEach(m => { const e = m.onReset?.('world'); if (e) moved = e; });
    if (moved) this.moveEntry(moved);
    this.respawn('msg.mapReset', revive ? 'death' : 'reset', appearDelayMs);
  }

  /** 重置之后玩家回到复活点（message = 顶上闪的提示，null = 不闪）。delayMs > 0：人（连同帽子、手上的东西）先藏起来冻着，过这么久再出现 */
  respawn(message: MsgKey | null, reason: AppearReason, delayMs = 0): void {
    const p = this.d.player(), { rooms } = this.d;
    this.dead = false;
    this.shatter.clear();
    this.d.onRespawn?.();
    // 复活点可能留在别的房间（骑纸过边界时不记新入口）：先切过去，骷髅手按那个房间放人
    const er = rooms.of(this.entry.x, this.entry.y);
    if (!rooms.same(er, rooms.current)) rooms.enter(er, false);
    rooms.wake(er);
    this.d.fogDirty();
    if (message) this.d.flash(message, '#9ad1ff');
    if (this.d.away()) { p.respawn(this.entry); p.freeze(0xffffff); p.clearTint(); p.setVisible(false); return; }
    if (delayMs <= 0) { this.appear(reason); return; }
    this.respawning = true;   // 藏着的时候不响应按键、不会死、不换房间
    p.freeze(0xffffff); p.clearTint(); p.setVisible(false);
    this.d.scene.time.delayedCall(delayMs, () => {
      this.respawning = false;
      p.setVisible(true);
      this.appear(reason);
    });
  }

  /**
   * 玩家出现在 entry（开局、换层、复活、R、进入下一关都走这里）。
   * config.respawnHandOn[reason] 开着就由骷髅手捏着放进来：放下之前人冻着、不响应输入、不会死；关着就直接出现。
   * then = 落地、能动了之后
   */
  appear(reason: AppearReason, then?: () => void): void {
    const { scene, cfg, rooms } = this.d, p = this.d.player(), entry = this.entry;
    p.setVisible(true);   // 死的时候炸成碎块、人藏起来了
    const land = () => { p.respawn(entry); this.lastResetAt = scene.time.now; this.d.fogDirty(); then?.(); };
    if (cfg.respawnHandMs <= 0 || !cfg.respawnHandOn[reason]) { land(); return; }
    this.respawning = true;
    const x0 = rooms.current.rx * rooms.pxW;
    playRespawnHand(scene, p, entry, { tile: cfg.tile, durationMs: cfg.respawnHandMs, roomLeft: x0, roomRight: x0 + rooms.pxW, handTiles: cfg.gmHand.carryTiles }, () => {
      this.respawning = false;
      land();
      p.playAction('getup', { interruptible: true });   // 被放下：坐地、爬起来；按方向键或跳就打断
    });
  }

  /** 死亡画面里按 R（或点一下）：按设置（config.deathReset）复活、重置当前房间或整张地图 */
  resetAfterDeath(): void {
    if (!this.dead || this.d.scene.time.now - this.diedAt < 300) return;   // 刚死的一瞬间不响应，免得误触
    const mode = this.d.cfg.deathReset;
    if (mode === 'world') this.resetWorld(true);
    else if (mode === 'room' || this.d.mechs().some(m => m.resetsRoomOnDeath?.())) this.resetRoom(true);
    else this.revive();
    this.d.setMode('playing');
  }

  /**
   * 死了什么都不重置（config.deathReset = 'none'）：解过的就算解过了。地形、引线、门、箱子、钥匙、怪物都保持原样，
   * 正在烧的引线、在掉的碎块照常进行；手上拿着的东西也还在手上。只收掉对话和镜头特效，人回到复活点、心回满
   */
  private revive(): void {
    const { scene } = this.d;
    this.d.dialogue.end();
    scene.tweens.killTweensOf(scene.cameras.main);
    scene.cameras.main.shakeEffect.reset();
    this.respawn(null, 'death');   // 不弹提示：人回来了就是复活了
  }

  /** 活着按 R：整张地图模式重置整张图，别的模式重置当前房间（死了不重置时，卡关就靠它）；fadeMs = 人藏多久再出现（等特效的新画面淡入） */
  resetByConfig(fadeMs = 0): void {
    if (this.d.cfg.deathReset === 'world') this.resetWorld(false, fadeMs); else this.resetRoom(false, fadeMs);
  }

  die(reason: DeathKey): void {
    if (this.dead || this.respawning || this.d.busy()) return;   // 换层、进入下一关（淡出 + 长大）的过程中人是冻住的，不会死
    const { scene, rooms } = this.d, p = this.d.player();
    this.dead = true;
    this.d.dialogue.end();
    // 刚重置就死 = 入口本身致命 → 退回上一个房间的入口
    if (this.lastResetAt != null && scene.time.now - this.lastResetAt < 400 && this.prevEntry) {
      this.entry = this.prevEntry; this.prevEntry = null;
      const r = rooms.of(this.entry.x, this.entry.y);
      if (!rooms.same(r, rooms.current)) rooms.enter(r, false);
    }
    p.freeze(0xffffff);
    this.shatter.burst(p);   // 白闪一下，炸成碎块四溅
    this.d.flash(reason, hex(Colors.rose));
    scene.cameras.main.shake(200, 0.01);
    this.diedAt = scene.time.now;
    this.d.setMode('dead');
  }
}
