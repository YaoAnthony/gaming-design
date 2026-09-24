// ===== 携带（共用机制）：手上只有一个位置 =====
// 蜡烛、钥匙都是"拿在手上"的东西：碰到就捡，手里已经有东西时两者交换，旧的留在原地（人走开之后才能再捡）。
// 有照明的东西在地上自己发光（迷雾里的光源），拿在手上把视野撑开。
import Phaser from 'phaser';
import type { ItemDef, SaveData } from '@/type';
import { Items } from '@/game/registry/registry';
import type { PlayContext } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';

/** 能拿在手上的东西 */
export interface Carryable {
  id: string;
  texture: string;
  tint: number;
  /** 照明半径（格），0 = 不发光 */
  light: number;
  /** 钥匙对应的组 */
  key?: number;
}
interface GroundThing { carry: Carryable; x: number; y: number; sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; /** 刚放下的：人走开之前不能再捡 */ blocked: boolean }

export const carryOfItem = (d: ItemDef): Carryable => ({ id: d.id, texture: d.texture, tint: 0xffffff, light: d.light });

export class Carry implements Mechanic {
  private ground: GroundThing[] = [];
  private held: { carry: Carryable; sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image } | null = null;
  /** 进场时手里的东西（换层 / 读档带过来的道具 id） */
  private heldId: string | null;
  private placeHeld = () => this.place();

  constructor(private ctx: PlayContext) {
    this.heldId = ctx.start.held ?? null;
  }

  /** 手上拿的东西 */
  get holding(): Carryable | null { return this.held?.carry ?? null; }

  /** 地图上的道具物件 */
  addItem(item: ItemDef, x: number, y: number): void {
    if (this.heldId === item.id) return;   // 已经拿着了，地上不再放
    this.spawnGround(carryOfItem(item), x, y);
  }

  /** 放一个东西在地上：会发光的自带光晕，也是迷雾里的光源 */
  spawnGround(carry: Carryable, x: number, y: number, blocked = false): void {
    const scene = this.ctx.scene;
    const sprite = scene.add.image(x, y, carry.texture).setTint(carry.tint).setDepth(2.4);
    scene.tweens.add({ targets: sprite, y: y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    let glow: Phaser.GameObjects.Image | undefined;
    if (carry.light > 0) {
      glow = scene.add.image(x, y, 'fogglow').setDepth(2.35).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(1.5);
      scene.tweens.add({ targets: glow, alpha: 0.45, scale: 1.75, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.ground.push({ carry, x, y, sprite, glow, blocked });
    this.syncLightSources();
  }

  /** 手里的东西用掉了（钥匙开门） */
  consume(): void { this.dropHeldSprites(); }

  // ---------- 生命周期 ----------
  start(): void {
    const def = this.heldId ? Items.get(this.heldId) : undefined;
    if (def) this.hold(carryOfItem(def)); else this.heldId = null;
    // 手上的东西跟着人走：物理把人挪好之后再摆
    this.ctx.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.placeHeld);
  }

  /** 碰到就捡；手里有东西就换：旧的留在这个位置，等人走开才能再捡 */
  updateAlive(): void {
    const r = this.ctx.player.rect();
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      const touching = Phaser.Geom.Intersects.RectangleToRectangle(g.sprite.getBounds(), r);
      if (g.blocked) { if (!touching) g.blocked = false; continue; }
      if (!touching) continue;
      this.ground.splice(i, 1);
      g.sprite.destroy(); g.glow?.destroy();
      const old = this.held?.carry ?? null;
      this.hold(g.carry);
      if (old) this.spawnGround(old, g.x, g.y, true);
      this.syncLightSources();
      this.ctx.sparks.explode(8, g.x, g.y);
      this.ctx.autosave();
    }
  }

  /** 只有注册过的道具能带走（存档、换层）；钥匙留在本层 */
  persist(out: Partial<SaveData>): void {
    if (this.heldId && Items.has(this.heldId)) out.held = this.heldId;
  }

  destroy(): void { this.ctx.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.placeHeld); }

  // ---------- 内部 ----------
  private syncLightSources(): void {
    const T = this.ctx.cfg.tile;
    this.ctx.fog?.setSources(this.ground.filter(g => g.carry.light > 0).map(g => ({ x: Math.floor(g.x / T), y: Math.floor(g.y / T), r: g.carry.light })));
    this.ctx.fx.fogDirty();
  }

  /** 拿在右手上；有照明的顺便把迷雾半径撑开 */
  private hold(carry: Carryable): void {
    const scene = this.ctx.scene;
    this.dropHeldSprites();
    const sprite = scene.add.image(0, 0, carry.texture).setTint(carry.tint).setOrigin(0.5, 1).setDepth(10.5);
    const glow = scene.add.image(0, 0, 'fogglow').setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(carry.light > 0 ? 0.28 : 0).setScale(1.4);
    if (carry.light > 0) scene.tweens.add({ targets: glow, alpha: 0.42, scale: 1.6, duration: 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.held = { carry, sprite, glow }; this.heldId = carry.id;
    this.place();
    this.syncRadius();
  }

  private dropHeldSprites(): void {
    if (!this.held) return;
    this.held.sprite.destroy(); this.held.glow.destroy();
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
    const x = b.center.x + side * 13, y = b.center.y + 8;
    this.held.sprite.setPosition(x, y).setFlipX(side < 0);
    this.held.glow.setPosition(x, y - this.held.sprite.height / 2);
  }
}
