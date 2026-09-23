// 生成占位美术：纯 JS 写 PNG（不依赖任何绘图库），输出到 src/asset/
// 运行：npm run gen-art
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'asset');
mkdirSync(OUT, { recursive: true });

// ---- PNG 编码 ----
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(c) {
  const stride = c.w * 4 + 1;
  const raw = Buffer.alloc(stride * c.h);
  for (let y = 0; y < c.h; y++) { raw[y * stride] = 0; c.buf.copy(raw, y * stride + 1, y * c.w * 4, (y + 1) * c.w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 像素画布 ----
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.buf[i] = (c >> 16) & 255; this.buf[i + 1] = (c >> 8) & 255; this.buf[i + 2] = c & 255; this.buf[i + 3] = a;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  roundRect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cx = i < r ? r - 0.5 : i >= w - r ? w - r - 0.5 : i, cy = j < r ? r - 0.5 : j >= h - r ? h - r - 0.5 : j;
      if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r || (i >= r && i < w - r) || (j >= r && j < h - r)) this.set(x + i, y + j, c);
    }
  }
  tri(x1, y1, x2, y2, x3, y3, c) {
    const minX = Math.floor(Math.min(x1, x2, x3)), maxX = Math.ceil(Math.max(x1, x2, x3));
    const minY = Math.floor(Math.min(y1, y2, y3)), maxY = Math.ceil(Math.max(y1, y2, y3));
    const area = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((x2 - px) * (y3 - py) - (x3 - px) * (y2 - py)) / area;
      const w1 = ((x3 - px) * (y1 - py) - (x1 - px) * (y3 - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.set(x, y, c);
    }
  }
  line(x1, y1, x2, y2, c, t = 2) {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
    for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; this.rect(Math.round(x - t / 2), Math.round(y - t / 2), t, t, c); }
  }
  save(name) { writeFileSync(join(OUT, name), encodePNG(this)); console.log('wrote', name, `${this.w}x${this.h}`); }
}

const T = 32;

// ---- 砖块图集：0 泥土 1 岩石 2 脆岩 3 沙土 4 尖刺 ----
const tiles = new Canvas(T * 23, T);   // 0-4 基础砖块，5-20 引线的 16 种连接图案（只在编辑器里显示），21 纸，22 字块
// 泥土
tiles.rect(0, 0, T, T, 0x8d5a3b);
tiles.rect(4, 6, 6, 4, 0x6f452c); tiles.rect(18, 12, 8, 4, 0x6f452c); tiles.rect(8, 22, 6, 4, 0x6f452c); tiles.rect(22, 24, 5, 3, 0x6f452c);
tiles.rect(0, 0, T, 3, 0xa56f4a);
// 岩石
tiles.rect(T, 0, T, T, 0x5d6470);
tiles.rect(T + 2, 4, 12, 10, 0x474d57); tiles.rect(T + 18, 16, 12, 12, 0x474d57); tiles.rect(T + 4, 20, 8, 8, 0x474d57);
tiles.rect(T, 0, T, 2, 0x7a828f);
// 脆岩
tiles.rect(2 * T, 0, T, T, 0xc9b27c);
tiles.line(2 * T + 4, 2, 2 * T + 14, 14, 0x8a7448); tiles.line(2 * T + 14, 14, 2 * T + 8, 28, 0x8a7448);
tiles.line(2 * T + 28, 4, 2 * T + 18, 18, 0x8a7448); tiles.line(2 * T + 18, 18, 2 * T + 26, 30, 0x8a7448);
// 沙土
tiles.rect(3 * T, 0, T, T, 0xd9a066);
for (let i = 0; i < 10; i++) tiles.rect(3 * T + ((i * 7) % 28) + 2, ((i * 11) % 26) + 3, 3, 3, 0xc4884f);
tiles.rect(3 * T, 0, T, 3, 0xe8b77f);
// 尖刺（透明背景）
for (let k = 0; k < 4; k++) tiles.tri(4 * T + k * 8, T, 4 * T + k * 8 + 4, T - 14, 4 * T + k * 8 + 8, T, 0xef476f);
// 引线自动拼贴（编辑器叠加层）：帧 = 5 + 位掩码（上=1 右=2 下=4 左=8）；透明底，叠在砖块上
// 端头（只有一个邻居）和孤立格画成亮黄色节点：那是唯一能被点燃的地方
for (let mask = 0; mask < 16; mask++) {
  const ox = (5 + mask) * T;
  const c = T / 2;
  const wire = 0xff7b54, thick = 6, half = thick / 2;
  if (mask & 1) tiles.rect(ox + c - half, 0, thick, c + half, wire);          // 上
  if (mask & 2) tiles.rect(ox + c - half, c - half, T - c + half, thick, wire); // 右
  if (mask & 4) tiles.rect(ox + c - half, c - half, thick, T - c + half, wire); // 下
  if (mask & 8) tiles.rect(ox, c - half, c + half, thick, wire);              // 左
  tiles.rect(ox + c - half, c - half, thick, thick, wire);                     // 中心接点
  const bits = [1, 2, 4, 8].filter(b => mask & b).length;
  if (bits <= 1) {                                                             // 端头 / 孤立：可点燃节点
    tiles.rect(ox + c - 6, c - 6, 12, 12, 0xff9f1c);
    tiles.rect(ox + c - 4, c - 4, 8, 8, 0xffd166);
  }
}
// 纸：白底、淡淡的横线、一角微卷
tiles.rect(21 * T, 0, T, T, 0xf4f1e8);
for (let k = 0; k < 4; k++) tiles.rect(21 * T + 5, 8 + k * 6, 22, 1, 0xd8d3c4);
tiles.rect(21 * T, 0, T, 2, 0xffffff);
tiles.tri(21 * T + T, T - 8, 21 * T + T, T, 21 * T + T - 8, T, 0xd8d3c4);
// 字块：浅蓝灰的石板，中间一个小方孔
tiles.rect(22 * T, 0, T, T, 0xb8c4e0);
tiles.rect(22 * T, 0, T, 2, 0xdde4f5); tiles.rect(22 * T, T - 3, T, 3, 0x8e9bb8);
tiles.rect(22 * T + 12, 12, 8, 8, 0x8e9bb8); tiles.rect(22 * T + 14, 14, 4, 4, 0x6f7c99);
tiles.save('tiles.png');

// ---- 玩家 22x38 ----
const player = new Canvas(22, 38);
player.roundRect(0, 0, 22, 38, 5, 0x4cc9f0);
player.rect(13, 9, 5, 5, 0x0b0b14);
player.save('player.png');

// ---- 怪物 28x24 ----
const enemy = new Canvas(28, 24);
enemy.roundRect(0, 0, 28, 24, 7, 0x9b5de5);
enemy.rect(6, 7, 5, 5, 0xffffff); enemy.rect(17, 7, 5, 5, 0xffffff);
enemy.rect(8, 9, 2, 2, 0x0b0b14); enemy.rect(19, 9, 2, 2, 0x0b0b14);
enemy.save('enemy.png');

// ---- 大史莱姆 96x96（正好 3x3 格）----
const boss = new Canvas(96, 96);
boss.roundRect(0, 10, 96, 86, 32, 0x6a3fb0);
boss.roundRect(6, 16, 84, 74, 28, 0x9b5de5);
boss.roundRect(14, 22, 30, 16, 8, 0xc4a7ff);          // 高光
boss.rect(24, 44, 14, 16, 0xffffff); boss.rect(58, 44, 14, 16, 0xffffff);
boss.rect(30, 50, 6, 8, 0x0b0b14); boss.rect(64, 50, 6, 8, 0x0b0b14);
boss.rect(36, 72, 24, 6, 0x3a1f5c);                    // 嘴
boss.save('boss.png');

// ---- 门 24x32 ----
const door = new Canvas(24, 32);
door.roundRect(0, 0, 24, 44, 12, 0xffd166);
door.roundRect(4, 6, 16, 40, 8, 0x0b0b14);
door.save('door.png');

// ---- 引线端点（游戏里唯一可见的部分）12x12，暗红色，不抢眼 ----
const node = new Canvas(12, 12);
node.roundRect(0, 0, 12, 12, 3, 0x4a1418);
node.roundRect(2, 2, 8, 8, 2, 0x7a1f26);
node.rect(4, 4, 4, 4, 0x9c2b33);
node.save('fusenode.png');

// ---- 粒子 6x6 ----
const spark = new Canvas(6, 6);
spark.rect(0, 0, 6, 6, 0xffffff);
spark.save('spark.png');
