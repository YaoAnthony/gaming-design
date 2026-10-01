// ===== 史莱姆王的部件贴图：运行时按像素画出来，拼成一个能动的史莱姆（BossView） =====
// 和 scripts/gen-art.mjs 里画 boss.png 的是同一套画法（boss.png 是拼好的整张，编辑器物品栏和「再炸一次」用），
// 这里拆成：身体（不带五官和王冠）、眼白、瞳孔、眉毛、三种嘴、王冠、溅出来的黏液滴。
// 坐标都是 96x96 那张整图里的坐标，BossView 按它们把部件摆回原位。
import type Phaser from 'phaser';

export const BOSS_TEX = {
  body: 'bossBody', eye: 'bossEye', pupil: 'bossPupil', brow: 'bossBrow',
  mouth: 'bossMouth', mouthOpen: 'bossMouthOpen', mouthHurt: 'bossMouthHurt', crown: 'bossCrown', goo: 'bossGoo',
  gooFloor: 'bossGooFloor', alert: 'bossAlert',
} as const;

const PAL = { outline: 0x220d36, d3: 0x3b1866, d2: 0x55289a, d1: 0x7440c4, base: 0x9358e0, l1: 0xb487f2, l2: 0xd6bfff, shine: 0xf6efff };
const GOLD = { o: 0x5c3608, d: 0xc98a1e, m: 0xffc845, l: 0xfff0b0 };

/** 一张小画布：逐像素写，最后放进 Phaser 的纹理 */
class Pix {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4)); }
  set(x: number, y: number, c: number, a = 255): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (c >> 16) & 255; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: number): void { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  /** 画一个形状：先描一圈 outline（形状外 1 像素），再按 fill(x, y) 填色 */
  shape(inside: (x: number, y: number) => boolean, fill: (x: number, y: number) => number, outline?: number): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (inside(x, y) || outline === undefined) continue;
      if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) this.set(x, y, outline);
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (inside(x, y)) this.set(x, y, fill(x, y));
  }
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number): void {
    const area = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    for (let y = Math.floor(Math.min(y1, y2, y3)); y < Math.ceil(Math.max(y1, y2, y3)); y++)
      for (let x = Math.floor(Math.min(x1, x2, x3)); x < Math.ceil(Math.max(x1, x2, x3)); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((x2 - px) * (y3 - py) - (x3 - px) * (y2 - py)) / area, w1 = ((x3 - px) * (y1 - py) - (x1 - px) * (y3 - py)) / area;
        if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) this.set(x, y, c);
      }
  }
  save(scene: Phaser.Scene, key: string): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, this.w, this.h);
    if (!tex) return;
    tex.getContext().putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    tex.refresh();
  }
}

const inEll = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

/** 身体的轮廓（96x96 整图坐标）：上半是圆顶，往下慢慢鼓到最宽，最底下两行收一点 */
export const BODY = { cx: 48, top: 14, bottom: 95 };
const halfW = (y: number) => {
  const t = (y - BODY.top) / (BODY.bottom - BODY.top);
  let w = t < 0.6 ? 44 * Math.pow(Math.sin((t / 0.6) * Math.PI / 2), 0.5) : 44 + 1.5 * Math.sin(((t - 0.6) / 0.4) * Math.PI);
  if (y >= BODY.bottom - 1) w -= 2;
  return w;
};
const inBody = (x: number, y: number) => y >= BODY.top && y <= BODY.bottom && Math.abs(x + 0.5 - BODY.cx) <= halfW(y);

function drawBody(): Pix {
  const p = new Pix(96, 96), { cx, bottom } = BODY;
  p.shape(inBody, (x, y) => {
    const hw = halfW(y), nx = (x + 0.5 - cx) / hw, ny = (y - 58) / 46;
    const dz = Math.sqrt(Math.max(0, 1 - nx * nx * 0.85 - Math.max(0, ny) * ny * 0.6));
    if (hw - (x + 0.5 - cx) < 3 && nx > 0.6 && y < bottom - 6) return PAL.l1;   // 右边一道反光：果冻的透亮
    const v = 0.5 * dz - 0.42 * nx - 0.38 * ny + (y > bottom - 7 ? -0.25 : 0);
    return v > 0.62 ? PAL.l1 : v > 0.38 ? PAL.base : v > 0.12 ? PAL.d1 : v > -0.12 ? PAL.d2 : PAL.d3;
  }, PAL.outline);
  for (const [dx, w] of [[-34, 6], [-14, 8], [10, 7], [30, 6]]) for (let i = 0; i < w; i++) p.set(cx + dx + i, bottom - 1, PAL.d3);
  p.shape((x, y) => inEll(x, y, 27, 31, 9, 6) && inBody(x, y), (x, y) => (inEll(x, y, 25, 29, 5, 3) ? PAL.shine : PAL.l2));
  p.shape((x, y) => inEll(x, y, 40, 23, 2.2, 2.2), () => PAL.shine);
  for (const [bx, by, r] of [[70, 30, 3.2], [77, 64, 2.4], [18, 70, 2.6], [62, 84, 1.8], [28, 86, 1.6]]) {
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      if (d <= r && d > r - 1.2 && inBody(x, y)) p.set(x, y, PAL.l2);
    }
    p.set(bx - 1, by - 1, PAL.shine);
  }
  return p;
}

/** 眼白 16x18（中心 8,9）：下半带点阴影 */
function drawEye(): Pix {
  const p = new Pix(16, 18);
  p.shape((x, y) => inEll(x, y, 8, 9, 7, 8), (_x, y) => (y > 12 ? 0xd9d2ea : 0xffffff), PAL.outline);
  return p;
}
/** 瞳孔 8x10（中心 4,5）：带两点反光 */
function drawPupil(): Pix {
  const p = new Pix(8, 10);
  p.shape((x, y) => inEll(x, y, 4, 5, 3.6, 5), () => 0x0b0b14);
  p.set(2, 2, 0xffffff); p.set(3, 2, 0xffffff); p.set(2, 3, 0xffffff);
  return p;
}
/** 眉毛 18x5：一根粗横条，BossView 转个角度斜着放 */
function drawBrow(): Pix {
  const p = new Pix(18, 5);
  p.shape((x, y) => x >= 1 && x <= 16 && y >= 1 && y <= 3, () => PAL.outline);
  return p;
}
/** 咧嘴笑 32x12（中心 16,3 = 整图的 48,68 附近）：一道弧、两颗獠牙、一点舌头 */
function drawMouth(): Pix {
  const p = new Pix(32, 14), ox = 48 - 16, oy = 66;
  p.shape((x, y) => inEll(x + ox, y + oy, 48, 68, 15, 7) && y + oy >= 67, (x, y) => (inEll(x + ox, y + oy, 48, 76, 7, 4) ? 0xd94a6f : 0x1a0828), PAL.outline);
  p.tri(39 - ox, 1, 44 - ox, 1, 41.5 - ox, 7, 0xffffff); p.tri(52 - ox, 1, 57 - ox, 1, 54.5 - ox, 7, 0xffffff);
  return p;
}
/** 张大嘴（吼、喘气）26x22：椭圆的大口，上排两颗獠牙，底下舌头 */
function drawMouthOpen(): Pix {
  const p = new Pix(26, 22);
  p.shape((x, y) => inEll(x, y, 13, 11, 11, 9.5), (x, y) => (inEll(x, y, 13, 18, 7, 4) ? 0xd94a6f : y < 6 ? 0x2a0f3d : 0x1a0828), PAL.outline);
  p.tri(6, 3, 10, 3, 8, 9, 0xffffff); p.tri(16, 3, 20, 3, 18, 9, 0xffffff);
  return p;
}
/** 挨打时龇牙 26x10：咬紧的一排牙 */
function drawMouthHurt(): Pix {
  const p = new Pix(26, 10);
  p.shape((x, y) => x >= 1 && x <= 24 && y >= 1 && y <= 8, (x, y) => (y >= 3 && y <= 6 ? (x % 4 === 0 ? 0xb9b0d0 : 0xffffff) : 0x1a0828), PAL.outline);
  return p;
}
/** 王冠 40x20（整图里左上角在 28,-1）：三个尖、尖上宝珠，冠圈上一颗红宝石两颗绿宝石 */
export const CROWN = { x: 28, y: -2 };
function drawCrown(): Pix {
  const p = new Pix(40, 21), ox = CROWN.x, oy = CROWN.y;
  const inCrown = (x: number, y: number) => {
    const X = x + ox, Y = y + oy;
    if (Y >= 9 && Y <= 17 && X >= 30 && X <= 65) return true;
    for (const [tx, ty, bl, br] of [[35, 1, 30, 41], [48, -1, 41, 55], [61, 1, 55, 65]]) {
      if (Y < ty || Y > 9) continue;
      const k = (Y - ty) / (9 - ty);
      if (X + 0.5 >= tx - (tx - bl) * k && X + 0.5 <= tx + (br - tx) * k) return true;
    }
    return false;
  };
  p.shape(inCrown, (x, y) => { const X = x + ox, Y = y + oy; return Y >= 15 ? GOLD.d : Y <= 10 && X < 48 ? GOLD.l : X > 58 ? GOLD.d : GOLD.m; }, GOLD.o);
  for (let X = 31; X <= 64; X++) p.set(X - ox, 12 - oy, GOLD.l);
  const gem = (gx: number, gy: number, r: number, c: number, hi: number) => {
    p.shape((x, y) => Math.hypot(x + ox + 0.5 - gx, y + oy + 0.5 - gy) <= r, () => c, GOLD.o);
    p.set(Math.round(gx - r / 2) - ox, Math.round(gy - r / 2) - oy, hi);
  };
  gem(35, 2, 2, 0x4cc9f0, 0xdff6ff); gem(48, 0.5, 2.2, 0xef476f, 0xffd6df); gem(61, 2, 2, 0x4cc9f0, 0xdff6ff);
  gem(48, 13.5, 3, 0xef476f, 0xffd6df); gem(38, 13.5, 1.8, 0x06d6a0, 0xc8fff0); gem(58, 13.5, 1.8, 0x06d6a0, 0xc8fff0);
  return p;
}
/** 溅出来的黏液滴 6x6 */
function drawGoo(): Pix {
  const p = new Pix(6, 6);
  p.shape((x, y) => inEll(x, y, 3, 3, 2.6, 2.6), (x, y) => (x + y < 4 ? PAL.l1 : PAL.base), PAL.outline);
  return p;
}

/** 地上的一格黏液 32x12：上面一层亮亮的果冻膜，底下垂几滴；左右两头留透明，几格连起来是一整滩 */
function drawGooFloor(): Pix {
  const p = new Pix(32, 12);
  for (let x = 0; x < 32; x++) {
    const top = 2 + Math.round(1.2 * Math.sin(x * 0.55) + 0.8 * Math.sin(x * 1.3));   // 表面起伏
    for (let y = top; y <= 6; y++) p.set(x, y, y === top ? PAL.outline : y === top + 1 ? PAL.l2 : y <= top + 2 ? PAL.l1 : PAL.base);
    p.set(x, 7, PAL.d1);
  }
  for (const [x, len] of [[5, 3], [13, 4], [22, 2], [27, 3]]) for (let y = 8; y < 8 + len; y++) { p.set(x, y, PAL.d1); p.set(x + 1, y, y === 7 + len ? PAL.outline : PAL.base); }
  p.set(9, 3, PAL.shine); p.set(10, 3, PAL.shine); p.set(20, 4, PAL.shine);
  return p;
}
/** 受惊时头上冒的「!」 10x20 */
function drawAlert(): Pix {
  const p = new Pix(10, 20);
  p.shape((x, y) => (x >= 3 && x <= 6 && y >= 1 && y <= 12) || (x >= 3 && x <= 6 && y >= 15 && y <= 18), (_x, y) => (y < 5 ? 0xfff0b0 : 0xffc845), PAL.outline);
  return p;
}

/** 部件贴图都画好（同一个场景只画一次） */
export function ensureBossTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(BOSS_TEX.body)) return;
  drawBody().save(scene, BOSS_TEX.body);
  drawEye().save(scene, BOSS_TEX.eye);
  drawPupil().save(scene, BOSS_TEX.pupil);
  drawBrow().save(scene, BOSS_TEX.brow);
  drawMouth().save(scene, BOSS_TEX.mouth);
  drawMouthOpen().save(scene, BOSS_TEX.mouthOpen);
  drawMouthHurt().save(scene, BOSS_TEX.mouthHurt);
  drawCrown().save(scene, BOSS_TEX.crown);
  drawGoo().save(scene, BOSS_TEX.goo);
  drawGooFloor().save(scene, BOSS_TEX.gooFloor);
  drawAlert().save(scene, BOSS_TEX.alert);
}
