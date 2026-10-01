// ===== 地图迷雾：设计师迷雾区 + 全屋暗（光照扩散 + 半透明记忆） =====
// 两样东西分开：
// - 迷雾区：任何房间里都能画，藏秘密通道用。没揭开前全黑（连轮廓都不露，和墙里面的黑连成一片），光照不进去、也透不过去；
//   玩家踏进区内任一格（或者区里有砖被炸掉）整区永久揭开，黑慢慢淡掉。
// - 全屋暗（房间开关）：整个房间只看得见光照到的地方。没见过的很暗、隐约看得出轮廓（unseenAlpha = 1 就是全黑），
//   见过但不在视野的半透明，视野里清晰。光从玩家所在格出发沿空气逐格衰减，实心格能被照亮但挡住后面。
// 没开全屋暗的房间里，迷雾区以外正常显示。探索记忆随存档保存，不随死亡 / R 重置消失。
// 画法：每格一个迷雾浓度，写进两张小图（FogLayer：全屋暗的光照、迷雾区），放大平滑插值画进迷雾层 —— 光圈是圆润的渐变，
// 迷雾区的边跟着格子走、只有很窄的一圈柔边。
import type Phaser from 'phaser';
import type { CellRef, FogState, RoomCoord } from '@/type';
import { Tiles } from '@/game/registry/registry';

/** 迷雾区揭开时雾淡掉用多久（毫秒） */
export const ZONE_REVEAL_MS = 400;
/** 小图一格几个点：光照 1 个（插值横跨整格，光圈渐变最顺）；迷雾区 2 个（只在边界两边各 1/4 格里过渡，边收得紧） */
const LIGHT_SUB = 1, ZONE_SUB = 2;
/** 迷雾的颜色 */
const FOG_RGB = [0x05, 0x06, 0x0c];

/** 一张一格 sub×sub 个点的小图：每个点一个迷雾浓度，放大到房间大小时平滑插值，画进迷雾层 */
class FogLayer {
  private static count = 0;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: Phaser.GameObjects.Image;
  private readonly pixels: ImageData;
  private readonly pw: number;

  constructor(scene: Phaser.Scene, roomW: number, roomH: number, tile: number, private readonly sub: number) {
    const key = `foglayer${FogLayer.count++}`;   // 场景重开会建新的，名字不能重
    this.pw = roomW * sub;
    this.tex = scene.textures.createCanvas(key, roomW * sub, roomH * sub)!;
    this.pixels = this.tex.context.createImageData(roomW * sub, roomH * sub);
    this.img = scene.make.image({ key, add: false }).setOrigin(0).setScale(tile / sub);
  }

  /** 房间里第 (lx, ly) 格的迷雾浓度 0..1（一格里的 sub×sub 个点一样） */
  set(lx: number, ly: number, alpha: number): void {
    const d = this.pixels.data, a = Math.round(alpha * 255);
    for (let sy = 0; sy < this.sub; sy++) for (let sx = 0; sx < this.sub; sx++) {
      const p = ((ly * this.sub + sy) * this.pw + lx * this.sub + sx) * 4;
      d[p] = FOG_RGB[0]; d[p + 1] = FOG_RGB[1]; d[p + 2] = FOG_RGB[2]; d[p + 3] = a;
    }
  }

  /** 上传，平滑放大画进 rt */
  drawInto(rt: Phaser.GameObjects.RenderTexture): void {
    this.tex.context.putImageData(this.pixels, 0, 0);
    this.tex.refresh();
    this.tex.setFilter(0);   // Phaser.Textures.FilterMode.LINEAR。重新上传会按游戏的像素风设置变回 NEAREST，每次都要再设
    rt.draw(this.img);
  }

  destroy(): void { this.img.destroy(); this.tex.destroy(); }
}

export interface FogOptions {
  tile: number;
  roomW: number;
  roomH: number;
  radius: number;
  memoryAlpha: number;
  /** 没见过的格子的雾浓度（1 = 全黑） */
  unseenAlpha: number;
  /** 房间坐标 → 房间 key（用来组迷雾区 id 和查全屋暗的房间） */
  keyAt(rx: number, ry: number): string | null;
  /** 全屋暗的房间 key */
  darkRooms: Set<string>;
}

export class FogOfWar {
  readonly w: number;
  readonly h: number;
  private explored: Uint8Array;
  private light: Float32Array;
  private revealed = new Set<string>();
  /** 迷雾区是什么时候揭开的（淡出动画用）；存档里读出来的没有，算早就揭开了 */
  private revealedAt = new Map<string, number>();
  /** 现在的时间（compute / draw 传进来）；揭开的淡出按它算 */
  private now = 0;
  /** 当前房间的迷雾。换房间时和 rtPrev 对调：旧房间的迷雾原地留着，镜头平移的这 180ms 里两个房间都盖着 */
  private rt: Phaser.GameObjects.RenderTexture;
  private rtPrev: Phaser.GameObjects.RenderTexture;
  /** 全屋暗的光照 / 迷雾区，各一张小图 */
  private readonly lightLayer: FogLayer;
  private readonly zoneLayer: FogLayer;
  /** 迷雾区里一开始是实心的格子：被炸掉 / 烧掉了就揭开整区 */
  private readonly solidAtStart: Uint8Array;
  private room: RoomCoord = { rx: -1, ry: -1 };
  private dirty = true;
  /** 每格属于哪个迷雾区（zoneKeys 的下标，-1 = 不在区里）；建的时候算一次 */
  private readonly zoneOf: Int32Array;
  private readonly zoneKeys: string[] = [];
  /** 全屋暗的房间里的格子（只有它们按光照显示；别的格子除了没揭开的迷雾区都正常显示） */
  private readonly dark: Uint8Array;
  /** 上一次照亮的格子：下一次重算只把这些清零，不清整张图 */
  private lit: number[] = [];

  constructor(scene: Phaser.Scene, private grid: string[][], zones: string[][], private opts: FogOptions, saved?: FogState) {
    this.h = grid.length; this.w = grid[0].length;
    this.explored = new Uint8Array(this.w * this.h);
    this.light = new Float32Array(this.w * this.h);
    this.zoneOf = new Int32Array(this.w * this.h).fill(-1);
    this.dark = new Uint8Array(this.w * this.h);
    const zoneIds = new Map<string, number>();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x, key = opts.keyAt(Math.floor(x / opts.roomW), Math.floor(y / opts.roomH));
      if (key && opts.darkRooms.has(key)) this.dark[i] = 1;
      const c = zones[y]?.[x];
      if (!key || !c || c === '.') continue;
      const zk = `${key}:${c}`;
      if (!zoneIds.has(zk)) { zoneIds.set(zk, this.zoneKeys.length); this.zoneKeys.push(zk); }
      this.zoneOf[i] = zoneIds.get(zk)!;
    }
    if (saved && saved.explored.length === this.h) {
      saved.explored.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') this.explored[y * this.w + x] = 1; }));
      saved.revealedZones.forEach(z => this.revealed.add(z));
    }
    const T = opts.tile;
    this.rt = scene.add.renderTexture(0, 0, opts.roomW * T, opts.roomH * T).setOrigin(0).setDepth(12).setVisible(false);
    this.rtPrev = scene.add.renderTexture(0, 0, opts.roomW * T, opts.roomH * T).setOrigin(0).setDepth(12).setVisible(false);
    this.lightLayer = new FogLayer(scene, opts.roomW, opts.roomH, T, LIGHT_SUB);
    this.zoneLayer = new FogLayer(scene, opts.roomW, opts.roomH, T, ZONE_SUB);
    this.solidAtStart = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.w * this.h; i++) {
      if (this.zoneOf[i] >= 0 && Tiles.get(grid[Math.floor(i / this.w)][i % this.w])?.solid) this.solidAtStart[i] = 1;
    }
  }

  /** 柔光圆贴图 fogglow（BootScene 建一次；复活手、地上的蜡烛用它发光） */
  static createTextures(textures: Phaser.Textures.TextureManager, tile: number): void {
    if (textures.exists('fogglow')) return;
    const size = tile * 3;
    const gl = textures.createCanvas('fogglow', size, size)!;
    const g = gl.context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    gl.context.fillStyle = g; gl.context.fillRect(0, 0, size, size); gl.refresh();
  }

  destroy(): void { this.rt.destroy(); this.rtPrev.destroy(); this.lightLayer.destroy(); this.zoneLayer.destroy(); }

  /** 光照传播（纯函数）：返回每格亮度 0..1。
   *  形状是圆：亮度按到玩家的直线距离衰减，超过 radius 就不亮；沿空气八方向扩散，实心格被照亮但不再传播 */
  static computeLight(grid: string[][], sx: number, sy: number, radius: number): Float32Array {
    const w = grid[0].length;
    const light = new Float32Array(w * grid.length);
    FogOfWar.forEachLit(grid, sx, sy, radius, (i, v) => { light[i] = v; });
    return light;
  }

  /** 同上，但只把照亮的格子（格子序号 + 亮度）交给 fn：只在光的半径范围里做事，不分配整张图大小的数组。blocks = 额外当墙挡光的格子（假墙） */
  static forEachLit(grid: string[][], sx: number, sy: number, radius: number, fn: (i: number, v: number) => void, blocks?: (x: number, y: number) => boolean): void {
    const h = grid.length, w = grid[0].length;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    // 光只会落在以光源为中心、半径 radius 的方框里：已访问标记只开这么大
    const r = Math.ceil(radius) + 1, bw = 2 * r + 1;
    const seen = new Uint8Array(bw * bw);
    const local = (x: number, y: number) => (y - sy + r) * bw + (x - sx + r);
    const solid = (x: number, y: number) => !!Tiles.get(grid[y][x])?.solid || !!blocks?.(x, y);
    const value = (x: number, y: number) => { const d = Math.hypot(x - sx, y - sy); return d > radius ? 0 : 1 - d / (radius + 1); };
    const q: number[] = [sy * w + sx];
    seen[local(sx, sy)] = 1; fn(sy * w + sx, 1);
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++]; const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const v = value(nx, ny);
        if (v <= 0) continue;   // 超出半径：也就不会出方框
        const li = local(nx, ny);
        if (seen[li]) continue;
        // 斜向不能从两块墙的夹缝里钻过去
        if (dx && dy && solid(x + dx, y) && solid(x, y + dy)) continue;
        seen[li] = 1; fn(ny * w + nx, v);
        if (!solid(nx, ny)) q.push(ny * w + nx);   // 墙被照亮，但挡住后面
      }
    }
  }

  /** 玩家站在 (px, py) 格：重算视野、揭开迷雾区、更新记忆 */
  /** 场景里其他光源（地上的蜡烛等），格坐标 + 半径 */
  private sources: { x: number; y: number; r: number }[] = [];
  setSources(list: { x: number; y: number; r: number }[]): void { this.sources = list; this.dirty = true; }

  /**
   * 只处理这一次被照亮的格子：上一次亮的清零，玩家和每个光源各扩散一次（每格取最亮的），再按迷雾区过滤。光只对全屋暗的房间有意义。
   * stepReveals = 玩家站在这一格算不算「踏进」迷雾区：复活时被骷髅手拎着路过不算（false），落了地才算
   */
  compute(px: number, py: number, now = this.now, stepReveals = true): void {
    this.now = now;
    this.lit.forEach(i => { this.light[i] = 0; });
    const lit: number[] = [];
    const add = (i: number, v: number) => {
      if (!this.dark[i]) return;
      if (this.light[i] === 0) lit.push(i);
      if (v > this.light[i]) this.light[i] = v;
    };
    // 区里有砖被炸掉 / 烧掉了：整区揭开（墙都破了，没法再装）
    for (let i = 0; i < this.solidAtStart.length; i++) {
      if (this.solidAtStart[i] && this.hiddenZone(i) && !Tiles.get(this.grid[Math.floor(i / this.w)][i % this.w])?.solid) this.reveal(this.zoneOf[i], now);
    }
    // 没揭开的迷雾区挡光：光照不进去，也透不过去照亮后面（不然黑区后面亮着一块，反而奇怪）
    const blocks = (x: number, y: number) => this.hiddenZone(y * this.w + x);
    FogOfWar.forEachLit(this.grid, px, py, this.opts.radius, add, blocks);
    this.sources.forEach(s => FogOfWar.forEachLit(this.grid, s.x, s.y, s.r, add, blocks));
    // 踏进迷雾区就揭开整个区（假墙在 ZONE_REVEAL_MS 里淡掉）
    const z = stepReveals ? this.zoneAt(px, py) : -1;
    if (z >= 0) this.reveal(z, now);
    lit.forEach(i => { if (!this.hiddenZone(i)) this.explored[i] = 1; });   // 没揭开的区照到了也不算见过（预览不显示里面）
    this.lit = lit;
    this.dirty = true;
  }

  /** 揭开第 z 个迷雾区（已经揭开就不动） */
  private reveal(z: number, now: number): void {
    const key = this.zoneKeys[z];
    if (this.revealed.has(key)) return;
    this.revealed.add(key); this.revealedAt.set(key, now); this.dirty = true;
  }

  private zoneAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.zoneOf[y * this.w + x];
  }

  /** 这个格子玩家知道吗（预览、UI 用）：没揭开的迷雾区不知道；普通房间都知道；全屋暗的房间看见过才知道 */
  isKnown(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    if (this.hiddenZone(i)) return false;
    return !this.dark[i] || this.explored[i] === 1;
  }

  /**
   * 这一格（格子中心）有多清楚：0 = 全黑，1 = 完全看得见。
   * 没揭开的迷雾区全黑（连轮廓都不露），刚揭开的按淡出进度；普通房间完全看得见；
   * 全屋暗的房间里：视野里按亮度，见过的按记忆，没见过的很暗但隐约看得出轮廓
   */
  clarity(x: number, y: number, now = this.now): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    const i = y * this.w + x;
    return this.baseClarity(i) * (1 - this.zoneCover(i, now));
  }

  /** 不算迷雾区时这一格有多清楚：普通房间 1；全屋暗的房间按光照 / 记忆 */
  private baseClarity(i: number): number {
    if (!this.dark[i]) return 1;
    const l = this.light[i];
    if (l > 0) return Math.min(1, 0.3 + 0.7 * l);
    return this.explored[i] ? 1 - this.opts.memoryAlpha : 1 - this.opts.unseenAlpha;
  }

  /** 在还没揭开的迷雾区里 */
  private hiddenZone(i: number): boolean {
    const z = this.zoneOf[i];
    return z >= 0 && !this.revealed.has(this.zoneKeys[z]);
  }

  /** 迷雾区的黑盖得多严：1 = 没揭开，揭开后 ZONE_REVEAL_MS 里淡到 0；不在区里是 0 */
  private zoneCover(i: number, now: number): number {
    const z = this.zoneOf[i];
    if (z < 0) return 0;
    const key = this.zoneKeys[z];
    if (!this.revealed.has(key)) return 1;
    const at = this.revealedAt.get(key);
    return at === undefined ? 0 : Math.max(0, 1 - (now - at) / ZONE_REVEAL_MS);
  }

  /** 照明半径变了（比如捡到蜡烛） */
  setRadius(r: number): void { if (r !== this.opts.radius) { this.opts.radius = r; this.dirty = true; } }

  setRoom(r: RoomCoord): void {
    if (r.rx === this.room.rx && r.ry === this.room.ry) return;
    // 旧房间那张原样留在原地，新房间用另一张画；画好之前先藏着，免得闪一下旧内容
    [this.rt, this.rtPrev] = [this.rtPrev, this.rt];
    this.rt.setVisible(false);
    this.room = r; this.dirty = true;
  }
  markDirty(): void { this.dirty = true; }

  /**
   * 只在脏的时候重画：每格算一个迷雾浓度写进两张小图（全屋暗的光照、迷雾区），平滑放大画进 rt。
   * 迷雾区正在淡出时每帧都画
   */
  draw(now = this.now): void {
    this.now = now;
    if (!this.dirty || this.room.rx < 0) return;
    this.dirty = false;
    const T = this.opts.tile, { roomW, roomH } = this.opts;
    const ox = this.room.rx * roomW, oy = this.room.ry * roomH;
    this.rt.setPosition(ox * T, oy * T);
    this.rt.clear();
    let anyDark = false, anyZone = false, fading = false;
    for (let ly = 0; ly < roomH; ly++)
      for (let lx = 0; lx < roomW; lx++) {
        const x = ox + lx, y = oy + ly;
        if (x >= this.w || y >= this.h) { this.lightLayer.set(lx, ly, 1); this.zoneLayer.set(lx, ly, 0); anyDark = true; continue; }
        const i = y * this.w + x;
        const fog = 1 - this.baseClarity(i), cover = this.zoneCover(i, now);
        if (fog > 0) anyDark = true;
        if (cover > 0) { anyZone = true; if (cover < 1) fading = true; }
        this.lightLayer.set(lx, ly, fog);
        this.zoneLayer.set(lx, ly, cover);
      }
    if (anyDark) this.lightLayer.drawInto(this.rt);
    if (anyZone) this.zoneLayer.drawInto(this.rt);
    this.rt.setVisible(true);
    if (fading) this.dirty = true;   // 迷雾区正在淡出：下一帧接着画
  }

  toState(): FogState {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) s += this.explored[y * this.w + x] ? '1' : '0'; rows.push(s); }
    return { explored: rows, revealedZones: [...this.revealed] };
  }

  /** 给预览用：过滤掉没见过的格子 */
  filterKnown<T extends CellRef>(cells: T[]): T[] { return cells.filter(c => this.isKnown(c.x, c.y)); }
}
