// ===== 帽子：戴在头上（单独的位置，不占手），主角算 1 + hatHeight 格高 =====
// - 碰到地上的帽子就戴上（头顶要有空间）
// - 往下按一下（↓ / S / 手柄往下）摘下，放在脚边（人走开之前不会再戴回去）
// - 戴着帽子钻 1 格高的隧道：帽子被撞掉在隧道口，人变回 1 格继续走
// - 换层、死亡都不掉；只在平台层生效（俯视层的身体大小由层机制管）
import Phaser from 'phaser';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import { INPUT_DOWN } from '@/shared/input';
import { floorMechanicOf, type Mechanic } from '../define';
import { Colors, hex } from '@/shared/palette';

interface GroundHat { sprite: Phaser.GameObjects.Image; /** 刚放下 / 刚被撞掉：人走开之前不能再戴 */ blocked: boolean }

export class Hat implements Mechanic {
  private worn: boolean;
  private head: Phaser.GameObjects.Image | null = null;
  private ground: GroundHat[] = [];
  /** 只在平台层生效 */
  private readonly enabled: boolean;
  private placeHead = () => this.place();
  private takeOff = () => this.drop('off');

  constructor(private ctx: PlayContext) {
    this.worn = ctx.carried('hat') === true;
    this.enabled = floorMechanicOf(ctx.floor).id === 'platform';
  }

  /** 现在头上有没有戴着帽子（通关弹窗用） */
  get wearing(): boolean { return this.worn; }

  /** 地图上的帽子物件：放在那一格的地面上 */
  addHat(x: number, y: number): void {
    if (this.worn) return;   // 已经戴着一顶（从上一层带来的），地上这顶就不放了
    this.putOnGround(x, y + this.ctx.cfg.tile / 2, false);
  }

  // ---------- 生命周期 ----------
  start(): void {
    const { ctx } = this;
    if (!this.enabled) return;
    if (this.worn) { if (this.hasHeadroom()) this.wear(); else { this.worn = false; this.putOnGround(ctx.player.x, ctx.player.body.bottom, true); } }
    ctx.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.placeHead);
    ctx.scene.events.on(INPUT_DOWN, this.takeOff);   // 往下按一下：键盘 ↓ / S、手柄、触屏都算
  }

  updateAlive(): void {
    if (!this.enabled) return;
    if (this.worn) { if (this.knockedOff()) this.drop('knock'); return; }
    // 碰到地上的帽子就戴上
    const r = this.ctx.player.rect();
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      const touching = Phaser.Geom.Intersects.RectangleToRectangle(g.sprite.getBounds(), r);
      if (g.blocked) { if (!touching) g.blocked = false; continue; }
      if (!touching || !this.hasHeadroom()) continue;
      g.sprite.destroy(); this.ground.splice(i, 1);
      this.wear();
      this.ctx.sparks.explode(6, this.ctx.player.x, this.ctx.player.y - this.ctx.cfg.tile);
      return;
    }
  }

  /** 戴着帽子就带到下一层（存档里是 carry.hat = true） */
  persist(): true | undefined { return this.worn ? true : undefined; }

  vortexTargets(): Suckable[] { return this.head ? [this.head] : []; }

  destroy(): void {
    const { scene } = this.ctx;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.placeHead);
    scene.events.off(INPUT_DOWN, this.takeOff);
  }

  // ---------- 内部 ----------
  private wear(): void {
    this.worn = true;
    this.ctx.player.setExtraHeight(this.ctx.cfg.hatHeight);
    this.head?.destroy();
    this.head = this.ctx.scene.add.image(0, 0, 'hat').setOrigin(0.5, 1).setDepth(10.2);
    this.place();
  }

  /** 摘下（↓ / S，只能在地上摘）或被隧道撞掉：帽子落在脚边，人变回原来的高度 */
  private drop(why: 'off' | 'knock'): void {
    const { ctx } = this, p = ctx.player;
    if (!this.worn || !this.enabled || ctx.dead || ctx.won || ctx.leaving) return;
    if (why === 'off' && !p.onGround) return;
    this.worn = false;
    p.setExtraHeight(0);
    this.head?.destroy(); this.head = null;
    this.putOnGround(p.x, p.body.bottom, true);
    if (why === 'knock') ctx.fx.flash('msg.hatKnocked', hex(Colors.paper));
  }

  /** 放一顶帽子到地上：从给定位置往下找到第一块实心砖，站在它上面 */
  private putOnGround(x: number, y: number, blocked: boolean): void {
    const { ctx } = this, T = ctx.cfg.tile, cx = Math.floor(x / T);
    let cy = Math.floor((y - 1) / T);
    while (cy < ctx.terrain.h - 1 && !ctx.terrain.isSolid(cx, cy + 1)) cy++;
    const sprite = ctx.scene.add.image(x, (cy + 1) * T, 'hat').setOrigin(0.5, 1).setDepth(2.4);
    this.ground.push({ sprite, blocked });
  }

  /** 头顶那 hatHeight 格没有实心砖，才戴得上。身高按现在的算（长大以后更高）；只在没戴着的时候问，身高里还没有帽子 */
  private hasHeadroom(): boolean {
    const { ctx } = this, T = ctx.cfg.tile, p = ctx.player, b = p.body;
    const top = b.bottom - (p.heightTiles + ctx.cfg.hatHeight) * T;
    return !this.anySolid(b.left, b.right, top, b.top);
  }

  /** 戴着帽子在地上走进 1 格高的隧道：前面一列，身体那几格是空的、帽子那几格有砖 */
  private knockedOff(): boolean {
    const { ctx } = this, T = ctx.cfg.tile, p = ctx.player, b = p.body;
    // 只在地上走进去才算：跳起来撞到台阶 / 墙角（身体下半段旁边正好是空的）不算隧道
    if (!b.blocked.down && !b.touching.down) return false;
    const side = b.blocked.right ? 1 : b.blocked.left ? -1 : 0;
    if (!side) return false;
    const ax = side > 0 ? b.right + 1 : b.left - 2;
    // 身体那段 = 现在的身高去掉帽子（主角长高以后身体也更高）
    const bodyTop = b.bottom - (p.heightTiles - ctx.cfg.hatHeight) * T;
    const bodyFree = !this.anySolid(ax, ax + 1, bodyTop, b.bottom);
    const hatHits = this.anySolid(ax, ax + 1, b.top, bodyTop);
    return bodyFree && hatHits;
  }

  /** 像素矩形 [x0, x1) × [y0, y1) 盖到的格子里有没有实心砖 */
  private anySolid(x0: number, x1: number, y0: number, y1: number): boolean {
    const T = this.ctx.cfg.tile, t = this.ctx.terrain;
    for (let cy = Math.floor(y0 / T); cy <= Math.floor((y1 - 1) / T); cy++)
      for (let cx = Math.floor(x0 / T); cx <= Math.floor((x1 - 1) / T); cx++)
        if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h || t.isSolid(cx, cy)) return true;
    return false;
  }

  /** 帽子跟着人：放在这一帧的头顶（跑跳时头会上下动），朝向跟人一样。挂在 POST_UPDATE 上且比玩家晚注册，读到的是挤压拉伸之后的样子 */
  private place(): void {
    if (!this.head) return;
    const p = this.ctx.player;
    this.head.setPosition(p.x, p.headTop + 1).setFlipX(p.flipX).setVisible(p.visible).setDisplaySize(p.artWidth, this.ctx.cfg.hatHeight * this.ctx.cfg.tile);   // 帽子占的高度 = 碰撞框加高的那段；人藏起来帽子也藏
  }
}
