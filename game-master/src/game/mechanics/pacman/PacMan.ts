// ===== 吃豆人层：俯视移动、豆子、葡萄、分数、四只鬼；清空之后的剧本和炸弹 =====
// 大力丸：1 阶段是经典的鬼变蓝；2 阶段（豆子吃光、鬼加速之后）变成强化道具——移速加快、能多放一颗炸弹，死了清零。
// 4 颗大力丸在进 2 阶段时、以及每次复活时都会刷新。
import Phaser from 'phaser';
import type { CellRef, Point } from '@/type';
import type { PlayContext } from '@/game/core/PlayContext';
import type { FloorMechanic, MoveInput } from '../define';
import { GhostManager } from './Ghosts';
import { GridWalker } from './GridWalker';
import { Bombs } from './Bombs';
import { PacScript } from './PacScript';

const PELLET_SCORE = 10;
const POWER_SCORE = 50;
const FRUIT_SCORE = 300;
/** 吃到第几颗豆子时出葡萄 */
const FRUIT_AT = [70, 170];
const FRUIT_MS = 9000;
/** 大力丸：蓝的时间一次比一次短 */
const FRIGHT_MS = 6000, FRIGHT_STEP_MS = 800, FRIGHT_MIN_MS = 1500;

interface Pellet { x: number; y: number; power: boolean; sprite: Phaser.GameObjects.Image }

export class PacMan implements FloorMechanic {
  readonly gravity = 0;
  /** 人靠格子逻辑走，不和砖块做物理碰撞（穿屏隧道要能出边界） */
  readonly collideTerrain = false;

  private pellets: Pellet[] = [];
  /** 所有豆子的原位：死亡复活时（剧情开始前）全部复原 */
  private pelletSpawns: { x: number; y: number; power: boolean }[] = [];
  private ghostHouses: Point[] = [];
  private fruitPoints: Point[] = [];
  private tunnels = new Set<number>();
  private score = 0;
  private eaten = 0;
  private powerCount = 0;
  /** 2 阶段吃了几颗大力丸（加移速、加炸弹上限）；死了清零 */
  private boosts = 0;
  private fruit: { sprite: Phaser.GameObjects.Image; until: number; x: number; y: number } | null = null;
  private fruitShown = new Set<number>();
  private ghosts: GhostManager | null = null;
  private walker!: GridWalker;
  private bombs: Bombs;
  private script: PacScript;

  constructor(private ctx: PlayContext) {
    this.bombs = new Bombs(ctx, () => this.ghosts, n => this.addScore(n));
    this.script = new PacScript(ctx, () => this.ghosts, this.bombs, () => this.walker.heading);
  }

  // ---------- 物件 ----------
  addPellet(p: Point, power: boolean): void {
    this.pelletSpawns.push({ x: p.x, y: p.y, power });
    this.placePellet(p, power);
  }
  addGhostHouse(p: Point): void { this.ghostHouses.push(p); this.ctx.scene.add.image(p.x, p.y, 'ghosthouse').setDepth(2.2); }
  addFruitPoint(p: Point): void { this.fruitPoints.push(p); }
  addTunnel(cell: CellRef): void { this.tunnels.add(cell.y * this.ctx.terrain.w + cell.x); }

  // ---------- 生命周期 ----------
  start(): void {
    const { ctx } = this, T = ctx.cfg.tile, p = ctx.player;
    this.walker = new GridWalker(p, T, ctx.cfg.topdownSpeed);
    this.walker.attach();
    p.setPosition(Math.floor(p.x / T) * T + T / 2, Math.floor(p.y / T) * T + T / 2);
    if (this.ghostHouses.length) this.spawnGhosts(this.ghostHouses[0]);
    ctx.hud.score(0);
    // 开发期：K = 把剩下的豆子一口吃光，直接看清空之后的剧情
    if (import.meta.env.DEV) ctx.scene.input.keyboard!.on('keydown-K', () => {
      if (!this.pellets.length) return;
      this.pellets.forEach(pe => pe.sprite.destroy());
      this.eaten += this.pellets.length; this.pellets = [];
      this.onCleared(ctx.scene.time.now);
    });
  }

  /** W / ↑ 是往上走，永远不当动作键；动作只认空格和手机动作键 */
  onPress(key: string): void {
    if (key === 'UP' || key === 'W') return;
    if (this.ctx.dialogue.talking) this.ctx.dialogue.advance();
    else if (this.bombs.unlocked && !this.ctx.dead) this.bombs.place();
  }

  /** 鬼巢的门人进不去；放下的炸弹（人走开之后）挡路 */
  blocks(cx: number, cy: number): boolean {
    const T = this.ctx.cfg.tile;
    return this.ghostHouses.some(h => Math.floor(h.x / T) === cx && Math.floor(h.y / T) === cy) || this.bombs.blocksPlayer(cx, cy);
  }

  /** 四方向走、穿屏、吃豆 */
  move(input: MoveInput, now: number, lock: boolean): void {
    const { ctx } = this, p = ctx.player, T = ctx.cfg.tile, room = ctx.rooms.current;
    const wrap = ctx.rooms.flag(room, 'wrapX');
    const x0 = room.rx * ctx.rooms.w, x1 = x0 + ctx.rooms.w;
    // 打通的房间：边界外当作通路，出去就从另一边进来
    const isSolid = (cx: number, cy: number) => (wrap && (cx < x0 || cx >= x1) ? false : ctx.blocked(cx, cy));
    this.walker.step(lock ? { left: false, right: false, up: false, down: false } : input, isSolid);
    if (wrap) {
      const left = x0 * T, right = x1 * T;
      if (p.body.center.x < left - T / 2) p.x += ctx.rooms.pxW; else if (p.body.center.x > right + T / 2) p.x -= ctx.rooms.pxW;
    }
    this.eatPellets(now);
    this.updateFruit(now);
  }

  /** 不管死活都要走的：鬼、炸弹、剧本 */
  update(now: number, dt: number): void {
    this.updateGhosts(now, dt);
    this.bombs.update(now);
    if (!this.ctx.dead) this.script.update(now);
  }

  onClear(): void { this.bombs.clear(); }

  /** 死亡 / R：鬼回巢重新按节拍出；4 颗大力丸刷新、2 阶段的加成清零；剧情还没开始的话小豆子也全部复原 */
  onReset(): void {
    this.ghosts?.reset(this.ctx.scene.time.now);
    this.walker.reset();
    this.setBoosts(0);
    if (!this.script.playing) { this.refreshPellets(true); return; }
    this.refreshPellets(false);
    this.eaten = 0; this.fruitShown.clear();
    if (this.fruit) { this.fruit.sprite.destroy(); this.fruit = null; }
  }

  destroy(): void { this.ghosts?.destroy(); this.ghosts = null; }

  // ---------- 内部 ----------
  private placePellet(p: Point, power: boolean): void {
    const scene = this.ctx.scene;
    const sprite = scene.add.image(p.x, p.y, power ? 'power' : 'pellet').setDepth(2.2);
    if (power) scene.tweens.add({ targets: sprite, alpha: 0.35, duration: 260, yoyo: true, repeat: -1 });
    this.pellets.push({ x: p.x, y: p.y, power, sprite });
  }

  /** 把豆子放回原位：onlyPower = 只刷新大力丸（小豆子不动） */
  private refreshPellets(onlyPower: boolean): void {
    const keep = this.pellets.filter(pe => onlyPower && !pe.power);
    this.pellets.filter(pe => !keep.includes(pe)).forEach(pe => pe.sprite.destroy());
    this.pellets = keep;
    this.pelletSpawns.filter(p => !onlyPower || p.power).forEach(p => this.placePellet({ x: p.x, y: p.y }, p.power));
  }

  /** 小豆子吃光：剧本进 2 阶段（鬼加速），4 颗大力丸刷新 */
  private onCleared(now: number): void {
    if (!this.script.playing) return;
    this.script.onCleared(now);
    this.refreshPellets(true);
  }

  /** 2 阶段的加成：吃了 n 颗 → 移速 + n 档、炸弹上限 + n（不超过 pacMaxBombs） */
  private setBoosts(n: number): void {
    const cfg = this.ctx.cfg;
    this.boosts = Math.max(0, Math.min(n, cfg.pacMaxBombs - cfg.pacBaseBombs));
    this.bombs.capacity = cfg.pacBaseBombs + this.boosts;
    this.walker.speed = cfg.topdownSpeed + this.boosts * cfg.pacBoostSpeed;
  }

  private addScore(n: number): void { this.score += n; this.ctx.hud.score(this.score); }

  /** 走到豆子所在格就吃掉 */
  private eatPellets(now: number): void {
    const b = this.ctx.player.body, T = this.ctx.cfg.tile;
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const pe = this.pellets[i];
      if (Math.abs(b.center.x - pe.x) > T * 0.45 || Math.abs(b.center.y - pe.y) > T * 0.45) continue;
      this.pellets.splice(i, 1); pe.sprite.destroy();
      this.eaten++;
      this.addScore(pe.power ? POWER_SCORE : PELLET_SCORE);
      if (pe.power) this.onPowerPellet();
      if (!this.pellets.some(q => !q.power)) this.onCleared(now);   // 小豆子吃光就算清空，四个角的大力丸不算
    }
  }

  /** 大力丸：1 阶段鬼全部变蓝（蓝的时间一次比一次短）；2 阶段不变蓝，给加成 */
  private onPowerPellet(): void {
    this.ctx.scene.cameras.main.flash(120, 255, 232, 176, false);
    if (!this.script.playing) {
      this.setBoosts(this.boosts + 1);
      this.ctx.fx.flash(`加速！炸弹 ×${this.bombs.capacity}`, '#ffe8b0');
      return;
    }
    const ms = Math.max(FRIGHT_MIN_MS, FRIGHT_MS - this.powerCount * FRIGHT_STEP_MS);
    this.powerCount++;
    this.ghosts?.frighten(ms);
  }

  /** 葡萄：吃到第 70 和 170 颗豆子时出现 9 秒 */
  private updateFruit(now: number): void {
    if (!this.fruitPoints.length) return;
    const scene = this.ctx.scene;
    if (!this.fruit && FRUIT_AT.includes(this.eaten) && !this.fruitShown.has(this.eaten)) {
      this.fruitShown.add(this.eaten);
      const p = this.fruitPoints[Math.floor(Math.random() * this.fruitPoints.length)];
      const sprite = scene.add.image(p.x, p.y, 'grapes').setDepth(2.3);
      scene.tweens.add({ targets: sprite, y: p.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.fruit = { sprite, until: now + FRUIT_MS, x: p.x, y: p.y };
    }
    if (!this.fruit) return;
    const b = this.ctx.player.body;
    if (Math.abs(b.center.x - this.fruit.x) < 16 && Math.abs(b.center.y - this.fruit.y) < 16) {
      this.addScore(FRUIT_SCORE); this.ctx.fx.popScore(this.fruit.x, this.fruit.y, FRUIT_SCORE);
      this.fruit.sprite.destroy(); this.fruit = null;
    } else if (now > this.fruit.until) { this.fruit.sprite.destroy(); this.fruit = null; }
  }

  private spawnGhosts(door: Point): void {
    const { ctx } = this, T = ctx.cfg.tile, terrain = ctx.terrain, r = ctx.rooms.of(door.x, door.y);
    this.ghosts = new GhostManager(ctx.scene, {
      tile: T, w: terrain.w,
      isSolid: (cx, cy) => cx < 0 || cy < 0 || cx >= terrain.w || cy >= terrain.h || terrain.isSolid(cx, cy) || this.bombs.at(cx, cy),
      room: { x0: r.rx * ctx.rooms.w, y0: r.ry * ctx.rooms.h, w: ctx.rooms.w, h: ctx.rooms.h },
      wrapX: ctx.rooms.flag(r, 'wrapX'),
      tunnels: this.tunnels,
      player: () => { const b = ctx.player.body; return { cx: Math.floor(b.center.x / T), cy: Math.floor(b.center.y / T), dir: this.walker.heading }; },
    }, door);
  }

  /** 鬼：每帧走一步，碰到玩家看是谁吃谁 */
  private updateGhosts(now: number, dt: number): void {
    const { ctx } = this, gm = this.ghosts;
    if (!gm) return;
    gm.update(dt, now);
    if (ctx.dead || ctx.won || ctx.leaving) return;
    const r = ctx.player.rect();
    const hit = gm.touch(new Phaser.Geom.Rectangle(r.x + 4, r.y + 4, r.width - 8, r.height - 8));
    if (hit.eaten) {
      const score = gm.eat(hit.eaten);
      this.addScore(score);
      ctx.fx.popScore(hit.eaten.x, hit.eaten.y, score);
      ctx.sparks.explode(10, hit.eaten.x, hit.eaten.y);
      ctx.scene.cameras.main.shake(80, 0.004);
    } else if (hit.caught) ctx.die('被鬼抓住了');
  }
}
