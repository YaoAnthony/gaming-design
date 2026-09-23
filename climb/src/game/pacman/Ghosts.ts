// ===== 吃豆人的四只鬼 =====
// 沿格子中线走，到每个格子中央挑下一步：不掉头、朝目标格直线距离最短的方向。
// 四只各有目标：红直追、粉堵前方四格、青拿红鬼和前方两格算夹击点、橙远追近逃。
// 全体按"散开 / 追击"节拍切换（切换时掉头）；大力丸全部变蓝减速可被吃，被吃后一双眼睛飘回巢。
import Phaser from 'phaser';
import type { CellRef, Point } from '@/type';

export type GhostName = 'blinky' | 'pinky' | 'inky' | 'clyde';
export type GhostMode = 'house' | 'leaving' | 'scatter' | 'chase' | 'frightened' | 'eyes' | 'dead';
type Dir = { x: number; y: number };

export const GHOST_COLORS: Record<GhostName, number> = { blinky: 0xff3b3b, pinky: 0xffb3e6, inky: 0x4cf0f0, clyde: 0xffb347 };
const FRIGHT_TINT = 0x2b3ac9;
const DIRS: Dir[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];   // 上 左 下 右：平手时按这个优先级
/** 散开 / 追击节拍（秒），最后一个追击是永久 */
const PHASES: { mode: 'scatter' | 'chase'; sec: number }[] = [
  { mode: 'scatter', sec: 7 }, { mode: 'chase', sec: 20 }, { mode: 'scatter', sec: 7 }, { mode: 'chase', sec: 20 },
  { mode: 'scatter', sec: 5 }, { mode: 'chase', sec: 20 }, { mode: 'scatter', sec: 5 }, { mode: 'chase', sec: Infinity },
];

export interface GhostWorld {
  tile: number;
  /** 地形宽（格），算隧道格下标用 */
  w: number;
  /** 鬼眼里的墙。门那格由管理器自己处理 */
  isSolid(cx: number, cy: number): boolean;
  /** 巢所在房间的格子矩形 */
  room: { x0: number; y0: number; w: number; h: number };
  wrapX: boolean;
  tunnels: Set<number>;
  /** 玩家所在格 + 朝向 */
  player(): { cx: number; cy: number; dir: Dir };
}

export interface GhostSpeeds { base: number; frightened: number; eyes: number; tunnel: number }
const SPEEDS: GhostSpeeds = { base: 105, frightened: 60, eyes: 230, tunnel: 55 };

export class Ghost {
  mode: GhostMode = 'house';
  x: number; y: number;
  dir: Dir = { x: 0, y: 0 };
  /** 什么时候出巢 */
  leaveAt = 0;
  readonly body: Phaser.GameObjects.Image;
  readonly face: Phaser.GameObjects.Image;
  private bob = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, readonly name: GhostName, x: number, y: number, readonly scatterTarget: CellRef, private T: number) {
    this.x = x; this.y = y;
    this.body = scene.add.image(x, y, 'ghost').setTint(GHOST_COLORS[name]).setDepth(6);
    this.face = scene.add.image(x, y, 'ghosteyes').setDepth(6.1);
  }

  get cell(): CellRef { return { x: Math.floor(this.x / this.T), y: Math.floor(this.y / this.T) }; }
  get alive(): boolean { return this.mode !== 'dead'; }
  get edible(): boolean { return this.mode === 'frightened'; }
  get dangerous(): boolean { return this.mode === 'scatter' || this.mode === 'chase' || this.mode === 'leaving'; }

  /** 画面：位置、裙边两帧交替、眼珠看向前进方向、脸、颜色 */
  render(now: number, frightFlash: boolean): void {
    const bobY = this.mode === 'house' ? Math.sin(now / 250 + this.bob) * 3 : 0;
    this.body.setTexture(Math.floor(now / 160) % 2 ? 'ghost2' : 'ghost');
    this.body.setPosition(this.x, this.y + bobY); this.face.setPosition(this.x + this.dir.x * 2, this.y + bobY + this.dir.y * 2);
    this.body.setVisible(this.mode !== 'eyes' && this.mode !== 'dead');
    this.face.setVisible(this.mode !== 'dead');
    if (this.mode === 'frightened') {
      this.face.setTexture('ghostscared');
      this.body.setTint(frightFlash && Math.floor(now / 120) % 2 === 0 ? 0xf1efe6 : FRIGHT_TINT);
    } else {
      this.face.setTexture('ghosteyes');
      this.body.setTint(GHOST_COLORS[this.name]);
    }
  }

  destroy(): void { this.body.destroy(); this.face.destroy(); }
}

export class GhostManager {
  readonly ghosts: Ghost[] = [];
  /** 清豆之后加速用 */
  speedMul = 1;
  /** 清豆之后：不再散开 */
  private permanentChase = false;
  private phase = 0;
  private phaseLeft = PHASES[0].sec * 1000;
  private frightLeft = 0;
  private frightTotal = 0;
  private combo = 0;
  private T: number;

  constructor(scene: Phaser.Scene, private world: GhostWorld, private door: Point) {
    this.T = world.tile;
    const T = this.T, r = world.room;
    const corners: Record<GhostName, CellRef> = {
      blinky: { x: r.x0 + r.w - 2, y: r.y0 + 1 }, pinky: { x: r.x0 + 1, y: r.y0 + 1 },
      inky: { x: r.x0 + r.w - 2, y: r.y0 + r.h - 2 }, clyde: { x: r.x0 + 1, y: r.y0 + r.h - 2 },
    };
    (['blinky', 'pinky', 'inky', 'clyde'] as GhostName[]).forEach((n, i) => {
      const g = new Ghost(scene, n, door.x + (i === 0 ? 0 : (i - 2) * T), door.y + (i === 0 ? 0 : T), corners[n], T);
      this.ghosts.push(g);
    });
    this.reset(scene.time.now);
  }

  get globalMode(): 'scatter' | 'chase' { return PHASES[this.phase].mode; }
  get doorCell(): CellRef { return { x: Math.floor(this.door.x / this.T), y: Math.floor(this.door.y / this.T) }; }

  /** 回到开局阵型：红的在门口，其余在巢里按时间陆续出来；节拍重来 */
  reset(now: number): void {
    const T = this.T;
    this.phase = 0; this.phaseLeft = PHASES[0].sec * 1000; this.frightLeft = 0; this.combo = 0;
    if (this.permanentChase) { this.phase = PHASES.length - 1; this.phaseLeft = Infinity; }
    this.ghosts.forEach((g, i) => {
      if (g.mode === 'dead') return;   // 被炸死的不回来
      g.x = this.door.x + (i === 0 ? 0 : (i - 2) * T); g.y = this.door.y + (i === 0 ? 0 : T);
      g.dir = { x: 0, y: 0 };
      g.mode = i === 0 ? this.globalMode : 'house';
      g.leaveAt = now + (this.permanentChase ? [0, 800, 1600, 2400] : [0, 2000, 5000, 8000])[i];
    });
  }

  /** 豆子吃光：永久追击，散开节拍作废，蓝色立刻结束 */
  forceChase(): void {
    this.permanentChase = true;
    this.phase = PHASES.length - 1; this.phaseLeft = Infinity; this.frightLeft = 0;
    this.ghosts.forEach(g => { if (g.mode === 'scatter' || g.mode === 'frightened') g.mode = 'chase'; });
  }

  /** 大力丸：全体变蓝掉头（眼睛和巢里的不算），连击清零 */
  frighten(ms: number): void {
    this.frightLeft = ms; this.frightTotal = ms; this.combo = 0;
    this.ghosts.forEach(g => { if (g.mode === 'scatter' || g.mode === 'chase') { g.mode = 'frightened'; g.dir = { x: -g.dir.x, y: -g.dir.y }; } });
  }

  /** 被吃：变成眼睛飘回巢，返回这一口的分数 */
  eat(g: Ghost): number {
    g.mode = 'eyes';
    const score = 200 << this.combo;
    this.combo++;
    return score;
  }

  /** 被炸死：留一团快速散开的影子 */
  kill(g: Ghost): void {
    g.mode = 'dead'; g.render(0, false);
    const puff = g.body.scene.add.image(g.x, g.y, 'ghost').setTint(GHOST_COLORS[g.name]).setDepth(6).setAlpha(0.9);
    g.body.scene.tweens.add({ targets: puff, scale: 1.8, alpha: 0, angle: 40, duration: 450, ease: 'Quad.out', onComplete: () => puff.destroy() });
  }

  get anyAlive(): boolean { return this.ghosts.some(g => g.alive); }

  update(dt: number, now: number): void {
    // 节拍
    if (this.frightLeft > 0) {
      this.frightLeft -= dt * 1000;
      if (this.frightLeft <= 0) this.ghosts.forEach(g => { if (g.mode === 'frightened') g.mode = this.globalMode; });
    } else if (this.phaseLeft !== Infinity) {
      this.phaseLeft -= dt * 1000;
      if (this.phaseLeft <= 0) {
        this.phase = Math.min(this.phase + 1, PHASES.length - 1);
        this.phaseLeft = PHASES[this.phase].sec * 1000;
        this.ghosts.forEach(g => { if (g.mode === 'scatter' || g.mode === 'chase') { g.mode = this.globalMode; g.dir = { x: -g.dir.x, y: -g.dir.y }; } });
      }
    }
    const flash = this.frightLeft > 0 && this.frightLeft < Math.min(1500, this.frightTotal * 0.4);
    this.ghosts.forEach(g => { this.step(g, dt, now); g.render(now, flash); });
  }

  private speedOf(g: Ghost): number {
    if (g.mode === 'eyes') return SPEEDS.eyes;
    if (g.mode === 'frightened') return SPEEDS.frightened;
    const c = g.cell;
    if (this.world.tunnels.has(c.y * this.world.w + c.x)) return SPEEDS.tunnel;
    return SPEEDS.base * this.speedMul;
  }

  /** 这只鬼能不能走进这一格：门和巢里面（门下那三格）只有出巢和眼睛回巢时能过 */
  private open(g: Ghost, cx: number, cy: number): boolean {
    const d = this.doorCell;
    const house = (cx === d.x && cy === d.y) || (cy === d.y + 1 && Math.abs(cx - d.x) <= 1);
    if (house) return g.mode === 'eyes' || g.mode === 'leaving';
    const r = this.world.room;
    if (this.world.wrapX && (cx < r.x0 || cx >= r.x0 + r.w)) return true;
    return !this.world.isSolid(cx, cy);
  }

  private target(g: Ghost): CellRef {
    if (g.mode === 'eyes') return this.doorCell;
    if (g.mode === 'scatter') return g.scatterTarget;
    const p = this.world.player();
    const pd = p.dir.x || p.dir.y ? p.dir : { x: 0, y: -1 };
    switch (g.name) {
      case 'blinky': return { x: p.cx, y: p.cy };
      case 'pinky': return { x: p.cx + pd.x * 4, y: p.cy + pd.y * 4 };
      case 'inky': {
        const b = this.ghosts[0].cell;
        const ax = p.cx + pd.x * 2, ay = p.cy + pd.y * 2;
        return { x: b.x + (ax - b.x) * 2, y: b.y + (ay - b.y) * 2 };
      }
      case 'clyde': {
        const c = g.cell;
        return Math.hypot(c.x - p.cx, c.y - p.cy) > 8 ? { x: p.cx, y: p.cy } : g.scatterTarget;
      }
    }
  }

  /** 在格子中央挑方向 */
  private decide(g: Ghost): void {
    const c = g.cell;
    const back = { x: -g.dir.x, y: -g.dir.y };
    let options = DIRS.filter(d => !(d.x === back.x && d.y === back.y && (g.dir.x || g.dir.y)) && this.open(g, c.x + d.x, c.y + d.y));
    if (!options.length) options = DIRS.filter(d => this.open(g, c.x + d.x, c.y + d.y));
    if (!options.length) { g.dir = { x: 0, y: 0 }; return; }
    if (g.mode === 'frightened') { g.dir = options[Math.floor(Math.random() * options.length)]; return; }
    const t = this.target(g);
    let best = options[0], bestD = Infinity;
    options.forEach(d => { const dd = (c.x + d.x - t.x) ** 2 + (c.y + d.y - t.y) ** 2; if (dd < bestD) { bestD = dd; best = d; } });
    g.dir = best;
  }

  private step(g: Ghost, dt: number, now: number): void {
    const T = this.T;
    if (g.mode === 'dead') return;
    if (g.mode === 'house') { if (now >= g.leaveAt) g.mode = 'leaving'; return; }
    if (g.mode === 'leaving') {
      // 先横移到门的正下方，再上到门口
      const s = SPEEDS.base * dt;
      if (Math.abs(g.x - this.door.x) > 1) { g.x += Math.sign(this.door.x - g.x) * Math.min(s, Math.abs(this.door.x - g.x)); return; }
      g.x = this.door.x;
      if (g.y > this.door.y + 1) { g.y -= Math.min(s, g.y - this.door.y); return; }
      g.y = this.door.y;
      g.mode = this.globalMode;   // 复活出来的不怕人，哪怕大力丸还没过
      g.dir = { x: -1, y: 0 };
      if (!this.open(g, g.cell.x - 1, g.cell.y)) g.dir = { x: 1, y: 0 };
      return;
    }
    // 眼睛到门口 → 进巢，一秒后再出来
    if (g.mode === 'eyes') {
      const d = this.doorCell;
      if (g.cell.x === d.x && g.cell.y === d.y && Math.abs(g.x - this.door.x) < 2 && Math.abs(g.y - this.door.y) < 2) {
        g.mode = 'house'; g.x = this.door.x; g.y = this.door.y + T; g.dir = { x: 0, y: 0 }; g.leaveAt = now + 1000;
        return;
      }
    }
    // 沿格子中线走：到中央就重新选方向
    let remain = this.speedOf(g) * dt;
    let guard = 4;
    while (remain > 0 && guard-- > 0) {
      const c = g.cell, cx = c.x * T + T / 2, cy = c.y * T + T / 2;
      if (!g.dir.x && !g.dir.y) { g.x = cx; g.y = cy; this.decide(g); if (!g.dir.x && !g.dir.y) return; }
      const ahead = (cx - g.x) * g.dir.x + (cy - g.y) * g.dir.y;   // 离本格中央还有多远（沿前进方向）
      if (ahead > 0.01) {
        const s = Math.min(remain, ahead);
        g.x += g.dir.x * s; g.y += g.dir.y * s; remain -= s;
        if (s === ahead) { g.x = cx; g.y = cy; this.decide(g); }
      } else {
        // 已过中央：往下一格走
        const nx = c.x + g.dir.x, ny = c.y + g.dir.y;
        if (!this.open(g, nx, ny)) { g.x = cx; g.y = cy; this.decide(g); if (!g.dir.x && !g.dir.y) return; continue; }
        const toEdge = (T / 2 + 0.01) - (-ahead);   // 走到下一格中央之前会先跨过格线
        const s = Math.min(remain, Math.max(toEdge, 0.5));
        g.x += g.dir.x * s; g.y += g.dir.y * s; remain -= s;
      }
      // 穿屏
      const r = this.world.room;
      if (this.world.wrapX) {
        if (g.x < r.x0 * T - T / 2) g.x += r.w * T; else if (g.x > (r.x0 + r.w) * T + T / 2) g.x -= r.w * T;
      }
    }
  }

  /** 和玩家的碰撞：吃到蓝鬼返回分数；撞上活鬼返回 'caught' */
  touch(rect: Phaser.Geom.Rectangle): { eaten?: Ghost; caught?: boolean } {
    for (const g of this.ghosts) {
      if (!g.alive || g.mode === 'house' || g.mode === 'eyes') continue;
      const gr = new Phaser.Geom.Rectangle(g.x - 9, g.y - 9, 18, 18);
      if (!Phaser.Geom.Intersects.RectangleToRectangle(gr, rect)) continue;
      if (g.edible) return { eaten: g };
      if (g.dangerous) return { caught: true };
    }
    return {};
  }

  destroy(): void { this.ghosts.forEach(g => g.destroy()); }
}
