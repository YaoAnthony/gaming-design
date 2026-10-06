// ===== 携带（共用机制）：手上只有一个位置 =====
// 蜡烛、钥匙都是"拿在手上"的东西：碰到就捡，手里已经有东西时两者交换，旧的留在原地（人走开之后才能再捡）。
// 有照明的东西在地上自己发光（迷雾里的光源、周围一小圈暖光），拿在手上把视野撑开。
// 钥匙画大一号、背后一圈同色的光一胀一缩、时不时闪一下，捡到时叮一声。
// 地上的钥匙有重力、有碰撞体积：会掉下去、会被怪物推着走（LooseKeys.ts）；蜡烛固定在原地。
// 往下按一下（↓ / S / 手柄 / 触屏）把手上的钥匙放在脚边；戴着帽子时这一下是摘帽子，钥匙不放。
import Phaser from 'phaser';
import type { ItemDef } from '@/type';
import { Items } from '@/game/registry/registry';
import { lockGroup } from '@/game/world/WorldModel';
import type { PlayContext } from '@/game/core/PlayContext';
import { INPUT_DOWN } from '@/shared/input';
import type { Mechanic } from '../define';
import type { Hat } from '../hat/Hat';
import { LooseKeys, type LooseKey } from './LooseKeys';
import { KEY_BODY } from './keyFall';

/** 能拿在手上的东西 */
export interface Carryable {
  id: string;
  texture: string;
  tint: number;
  /** 照明半径（格），0 = 不发光 */
  light: number;
  /** 钥匙对应的组 */
  key?: number;
  /** 钥匙：地图上的第几把（重置时认出手上拿的是哪一把，那一把不在原位再放一次） */
  origin?: number;
}
/** 场上的一把钥匙：哪一组、碰得到门的范围（像素）、用掉它 */
export interface KeyContact { group: number; area: Phaser.Geom.Rectangle; /** 地图上的第几把（认不出 = undefined） */ origin?: number; use: () => void }
interface GroundThing {
  /** (x, y) = 贴图停在地上时的中心；钥匙每帧按物理体更新 */
  carry: Carryable; x: number; y: number; sprite: Phaser.GameObjects.Image;
  /** 跟着它一起没的东西：光晕、暖光、钥匙的闪光 */
  extras: Phaser.GameObjects.GameObject[];
  /** 刚放下的：人走开之前不能再捡 */
  blocked: boolean;
  /** 人自己放下的（换东西时丢在这里）：整张地图重置时钥匙留在这里，不回地图原位 */
  dropped: boolean;
  /** 钥匙的物理体；蜡烛没有 */
  loose?: LooseKey;
}

/** 钥匙放大多少倍（贴图 16×16）：地上的、拿在手上的 */
const KEY_SCALE = { ground: 2, held: 1.5 };
/** 捡到钥匙的音效 */
const KEY_SOUND = { key: 'keyPickup', volume: 0.7 };

export const carryOfItem = (d: ItemDef): Carryable => ({ id: d.id, texture: d.texture, tint: 0xffffff, light: d.light });
/** 某一组的钥匙：id = 'key:组号'，按组的颜色染色 */
export const keyCarryable = (group: number, tint: number, origin?: number): Carryable => ({ id: 'key:' + group, texture: 'key', tint, light: 0, key: group, origin });

export class Carry implements Mechanic {
  private ground: GroundThing[] = [];
  private held: { carry: Carryable; sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image | null } | null = null;
  /** 进场时手里的东西（换层 / 读档带过来的道具 id） */
  private heldId: string | null;
  /** 地上钥匙的物理体 */
  private looseKeys: LooseKeys;
  /** 物理把人、钥匙挪好之后：手上的东西跟着人，地上钥匙的贴图跟着物理体 */
  private afterPhysics = () => { this.looseKeys.sync(this.ctx.scene.time.now); this.place(); };

  constructor(private ctx: PlayContext) {
    const carried = ctx.carried('carry');
    this.heldId = typeof carried === 'string' ? carried : null;
    this.looseKeys = new LooseKeys(ctx);
  }

  /** 手上拿的东西 */
  get holding(): Carryable | null { return this.held?.carry ?? null; }

  /** 地图上的道具物件 */
  addItem(item: ItemDef, x: number, y: number): void {
    if (this.heldId === item.id) return;   // 已经拿着了，地上不再放
    this.spawnGround(carryOfItem(item), x, y);
  }

  /**
   * 放一个东西在地上，(x, y) = 贴图停在地上时的中心。
   * 钥匙：画大、带同色光晕和闪光，有物理体（悬空就往下掉）；其他的原地上下浮，会发光的自带光晕和一小圈暖光，也是迷雾里的光源
   */
  spawnGround(carry: Carryable, x: number, y: number, blocked = false): void {
    const scene = this.ctx.scene;
    const thing: GroundThing = { carry, x, y, sprite: scene.add.image(x, y, carry.texture).setTint(carry.tint).setDepth(2.4), extras: [], blocked, dropped: false };
    if (carry.key !== undefined) {
      const { halo, glints } = this.keyShine(x, y, carry.tint);
      thing.extras.push(halo, glints);
      thing.loose = this.looseKeys.add({ sprite: thing.sprite, halo, glints, tint: carry.tint, scale: KEY_SCALE.ground }, x, y);   // 上下浮也由它管
    } else {
      scene.tweens.add({ targets: thing.sprite, y: y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      if (carry.light > 0) {
        const glow = scene.add.image(x, y, 'fogglow').setDepth(2.35).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(1.5);
        scene.tweens.add({ targets: glow, alpha: 0.45, scale: 1.75, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        thing.extras.push(glow);
        const warm = this.ctx.fx.light(x, y, 'candle');
        if (warm) thing.extras.push(warm);
      }
    }
    this.ground.push(thing);
    this.syncLightSources();
  }

  /** 地上钥匙的醒目效果：背后一圈同色的光一胀一缩，时不时在钥匙上闪一两颗白色亮点 */
  private keyShine(x: number, y: number, tint: number): { halo: Phaser.GameObjects.Image; glints: Phaser.GameObjects.Particles.ParticleEmitter } {
    const scene = this.ctx.scene, T = this.ctx.cfg.tile;
    const halo = scene.add.image(x, y, 'fogglow').setTint(tint).setDepth(2.35).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setScale(1.1);
    scene.tweens.add({ targets: halo, alpha: 0.6, scale: 1.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const glints = scene.add.particles(x, y, 'spark', {
      tint: [0xffffff, tint], blendMode: 'ADD', lifespan: 450, frequency: 700, quantity: 1,
      speed: { min: 0, max: 8 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, T * 0.4), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
    }).setDepth(2.45);
    return { halo, glints };
  }

  /**
   * 整张地图重置：拿掉该回原位的钥匙，Locks 再把它们放回地图上的原位。
   * keep = 死亡、按 R：手上拿着的留在手上，人自己丢下的留在丢下的地方（在那里摆好，不管后来被推到哪）；
   * 否则（进入下一关）全部拿掉。返回留下来的钥匙是地图上的第几把
   */
  clearKeys(keep: boolean): Set<number> {
    const kept = new Set<number>();
    this.ground.filter(g => g.carry.key !== undefined).forEach(g => {
      if (keep && g.dropped && g.carry.origin !== undefined) { kept.add(g.carry.origin); return; }
      this.removeGround(g);
    });
    if (this.held?.carry.key !== undefined) {
      // 手上的一定留着；认得出是第几把才不在原位再放一把（认不出的：比如读档带进来的，原位照放）
      if (!keep) this.dropHeldSprites();
      else if (this.held.carry.origin !== undefined) kept.add(this.held.carry.origin);
    }
    this.syncLightSources();
    return kept;
  }

  /** 手里的东西用掉了（钥匙开门） */
  consume(): void { this.dropHeldSprites(); }

  /**
   * 场上每一把钥匙，开门看的就是它们（Locks）。拿在手上的跟着人，碰得到门的范围就是人的身体（踩在门上、头顶着门都算）；
   * 地上的（包括正在掉、被怪物推着走的）是它自己的碰撞框。use = 这把钥匙开了门，用掉
   */
  keysInPlay(): KeyContact[] {
    const out: KeyContact[] = [];
    const held = this.held?.carry.key;
    if (held !== undefined) out.push({ group: held, area: this.ctx.player.rect(), origin: this.held?.carry.origin, use: () => this.consume() });
    this.ground.forEach(g => {
      if (g.carry.key === undefined || !g.loose) return;
      const b = g.loose.body;
      out.push({ group: g.carry.key, area: new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height), origin: g.carry.origin, use: () => this.useGround(g) });
    });
    return out;
  }

  // ---------- 生命周期 ----------
  start(): void {
    const start = this.heldId ? this.carryOf(this.heldId) : null;
    if (start) this.hold(start); else this.heldId = null;
    this.looseKeys.start();
    this.ctx.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysics);
    this.ctx.scene.events.on(INPUT_DOWN, this.putDown);   // 往下按一下：键盘 ↓ / S、手柄、触屏都算
  }

  /** 地上的钥匙：落地弹一下、被埋了挪出来；位置跟着物理体更新 */
  update(now: number): void {
    this.looseKeys.update(now);
    this.syncKeyAnchors();
  }

  /** 碰到就捡；手里有东西就换：旧的留在这个位置，等人走开才能再捡 */
  updateAlive(): void {
    const r = this.ctx.player.rect();
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      const touching = Phaser.Geom.Intersects.RectangleToRectangle(this.pickArea(g), r);
      if (g.blocked) { if (!touching) g.blocked = false; continue; }
      if (!touching) continue;
      this.removeGround(g);
      const old = this.held?.carry ?? null;
      this.hold(g.carry);
      if (g.carry.key !== undefined && this.ctx.scene.cache.audio.exists(KEY_SOUND.key)) this.ctx.scene.sound.play(KEY_SOUND.key, { volume: KEY_SOUND.volume });
      if (old) { this.spawnGround(old, g.x, g.y, true); this.ground[this.ground.length - 1].dropped = true; }
      this.syncLightSources();
      this.ctx.sparks.explode(8, g.x, g.y);
    }
  }

  /**
   * 地上的钥匙回到放下它的位置（只重置房间时：这个房间的）：地图上的回原位，人自己丢下的回丢下的地方。
   * 整张地图重置时该回原位的由 Locks 重新放（clearKeys）
   */
  onReset(scope: 'room' | 'world' | 'level'): void {
    this.looseKeys.reset(scope);
    this.syncKeyAnchors();
  }

  /** 只有注册过的道具能带到下一层（存档里是 carry.carry = 道具 id）；钥匙留在本层 */
  persist(): string | undefined {
    return this.heldId && Items.has(this.heldId) ? this.heldId : undefined;
  }

  destroy(): void {
    this.ctx.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysics);
    this.ctx.scene.events.off(INPUT_DOWN, this.putDown);
  }

  /**
   * 往下按一下：把手上的钥匙放在脚边（空中也能放，钥匙自己掉下去），人走开之前不能再捡。
   * 戴着帽子时这一下是摘帽子（Hat 也听这个事件；Carry 先建，先收到，这时帽子还在头上），钥匙不放
   */
  private putDown = (): void => {
    const { ctx } = this, held = this.held;
    if (!held || held.carry.key === undefined || ctx.dead || ctx.won || ctx.leaving) return;
    if (ctx.mech<Hat>('hat')?.wearing) return;
    const b = ctx.player.body, x = b.center.x;
    this.spawnGround(held.carry, x, b.bottom, true);
    const g = this.ground[this.ground.length - 1];
    g.dropped = true;
    if (g.loose) { g.loose.body.reset(x, b.bottom - KEY_BODY.h / 2); Object.assign(g, this.looseKeys.anchor(g.loose)); }   // 钥匙底边贴脚底
    this.dropHeldSprites();
    this.syncLightSources();
    ctx.sparks.explode(6, x, b.bottom - 6);
  };

  // ---------- 内部 ----------
  /**
   * 碰到就捡的范围：钥匙按它的碰撞框（和开门的范围一样）。按贴图算不行：掉下来时贴图会歪、会压扁，外框变大，
   * 人在隔壁一格往上跳、钥匙往下掉，隔着几像素也会擦到。其他东西按贴图
   */
  private pickArea(g: GroundThing): Phaser.Geom.Rectangle {
    if (!g.loose) return g.sprite.getBounds();
    const b = g.loose.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  /** 从地上拿掉（捡起来、开门用掉）：贴图、光晕、物理体一起没 */
  private removeGround(g: GroundThing): void {
    this.ground = this.ground.filter(o => o !== g);
    g.sprite.destroy(); g.extras.forEach(o => o.destroy());
    if (g.loose) this.looseKeys.remove(g.loose);
  }

  /** 地上的钥匙开了门：消失，冒一下火花 */
  private useGround(g: GroundThing): void {
    this.removeGround(g);
    this.ctx.sparks.explode(8, g.x, g.y);
  }

  /** 钥匙的 (x, y) 跟着物理体走：捡的判定、换东西时旧的放在哪都按它 */
  private syncKeyAnchors(): void {
    this.ground.forEach(g => { if (g.loose) Object.assign(g, this.looseKeys.anchor(g.loose)); });
  }

  /** 进场时手里的东西：注册过的道具，或者这一层存在的那一组钥匙（编辑器试玩可以直接带钥匙进来） */
  private carryOf(id: string): Carryable | null {
    const def = Items.get(id);
    if (def) return carryOfItem(def);
    const m = /^key:(\d+)$/.exec(id);
    const g = m ? lockGroup(this.ctx.model, Number(m[1])) : undefined;
    return g ? keyCarryable(g.id, g.color) : null;
  }

  private syncLightSources(): void {
    const T = this.ctx.cfg.tile;
    this.ctx.fog?.setSources(this.ground.filter(g => g.carry.light > 0).map(g => ({ x: Math.floor(g.x / T), y: Math.floor(g.y / T), r: g.carry.light })));
    this.ctx.fx.fogDirty();
  }

  /** 拿在右手上；有照明的顺便把迷雾半径撑开 */
  private hold(carry: Carryable): void {
    const scene = this.ctx.scene;
    this.dropHeldSprites();
    const sprite = scene.add.image(0, 0, carry.texture).setTint(carry.tint).setOrigin(0.5, 1).setDepth(10.5).setScale(carry.key !== undefined ? KEY_SCALE.held : 1);
    const glow = scene.add.image(0, 0, 'fogglow').setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(carry.light > 0 ? 0.28 : 0).setScale(1.4);
    if (carry.light > 0) scene.tweens.add({ targets: glow, alpha: 0.42, scale: 1.6, duration: 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const light = carry.light > 0 ? this.ctx.fx.light(0, 0, 'candle') : null;   // 拿着的蜡烛也照出一小圈暖光，跟着手走
    this.held = { carry, sprite, glow, light }; this.heldId = carry.id;
    this.place();
    this.syncRadius();
  }

  private dropHeldSprites(): void {
    if (!this.held) return;
    this.held.sprite.destroy(); this.held.glow.destroy(); this.held.light?.destroy();
    this.held = null; this.heldId = null;
    this.syncRadius();
  }

  private syncRadius(): void {
    this.ctx.fog?.setRadius(Math.max(this.ctx.cfg.fogRadius, this.held?.carry.light ?? 0));
    this.ctx.fx.fogDirty();
  }

  /** 右手 = 面朝方向那一侧 */
  private place(): void {
    if (!this.held) return;
    const p = this.ctx.player, side = p.flipX ? -1 : 1, b = p.body;
    const x = b.center.x + side * 13, y = p.y + p.displayHeight * 0.2;   // 大约在腰间：按贴图算，戴帽子加高的碰撞框不影响
    this.held.sprite.setPosition(x, y).setFlipX(side < 0).setVisible(p.visible);   // 人藏起来手上的东西也藏
    this.held.glow.setPosition(x, y - this.held.sprite.displayHeight / 2).setVisible(p.visible);
    this.held.light?.setPosition(x, y - this.held.sprite.displayHeight / 2).setVisible(p.visible);
  }
}
