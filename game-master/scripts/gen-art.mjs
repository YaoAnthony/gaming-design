// 生成占位美术：纯 JS 写 PNG（不依赖任何绘图库），输出到 src/asset/
// 运行：npm run gen-art                                 （全部重新生成，会覆盖手绘替换过的同名文件）
//       npm run gen-art -- hand_hold.png hand_open.png  （只生成列出的文件）
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'asset');
mkdirSync(OUT, { recursive: true });
/** 命令行给了文件名就只写这些 */
const ONLY = new Set(process.argv.slice(2));

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
  /** 把另一张画布整张贴到 (dx, dy) */
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const tx = x + dx, si = (y * src.w + x) * 4;
        if (tx < 0 || tx >= this.w || !src.buf[si + 3]) continue;
        src.buf.copy(this.buf, (ty * this.w + tx) * 4, si, si + 4);
      }
    }
  }
  save(name) {
    if (ONLY.size && !ONLY.has(name)) return;
    writeFileSync(join(OUT, name), encodePNG(this)); console.log('wrote', name, `${this.w}x${this.h}`);
  }
}

const T = 32;

// ---- 砖块图集：0 泥土 1 岩石 2 脆岩 3 沙土 4 尖刺 ----
const tiles = new Canvas(T * 29, T);   // 0-4 基础砖块，5-20 引线的 16 种连接图案（只在编辑器里显示，白色，按引线颜色染色），21 纸，22 字块，23 门（白底，运行时按组染色），24 木板，25 碎岩，26-28 尖刺挂左 / 挂右 / 两边
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
// 画成白色，编辑器按引线颜色染色。端头（只有一个邻居）和孤立格画成带深色芯的节点：那是唯一能被点燃的地方
for (let mask = 0; mask < 16; mask++) {
  const ox = (5 + mask) * T;
  const c = T / 2;
  const wire = 0xffffff, thick = 6, half = thick / 2;
  if (mask & 1) tiles.rect(ox + c - half, 0, thick, c + half, wire);          // 上
  if (mask & 2) tiles.rect(ox + c - half, c - half, T - c + half, thick, wire); // 右
  if (mask & 4) tiles.rect(ox + c - half, c - half, thick, T - c + half, wire); // 下
  if (mask & 8) tiles.rect(ox, c - half, c + half, thick, wire);              // 左
  tiles.rect(ox + c - half, c - half, thick, thick, wire);                     // 中心接点
  const bits = [1, 2, 4, 8].filter(b => mask & b).length;
  if (bits <= 1) {                                                             // 端头 / 孤立：可点燃节点
    tiles.rect(ox + c - 6, c - 6, 12, 12, 0xffffff);
    tiles.rect(ox + c - 3, c - 3, 6, 6, 0x5a5a5a);
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
// 门：浅色门板 + 边框 + 锁孔，画成近白色，游戏里乘上各组的颜色
tiles.rect(23 * T, 0, T, T, 0xbdbdbd);
tiles.rect(23 * T + 3, 3, T - 6, T - 6, 0xefefef);
tiles.rect(23 * T + 3, 3, T - 6, 2, 0xffffff); tiles.rect(23 * T + 3, T - 5, T - 6, 2, 0xd0d0d0);
tiles.rect(23 * T + 13, 10, 6, 6, 0x2a2a2a); tiles.rect(23 * T + 15, 15, 2, 7, 0x2a2a2a);
// 木板：只占格子上面一条（下面透明），两道木纹 + 两颗钉子，左右两端各一道接缝
tiles.rect(24 * T, 0, T, 9, 0xb07a45);
tiles.rect(24 * T, 0, T, 2, 0xd19a62);
tiles.rect(24 * T, 7, T, 2, 0x7a5230);
tiles.rect(24 * T + 3, 4, 10, 1, 0x93643a); tiles.rect(24 * T + 17, 3, 11, 1, 0x93643a);
tiles.rect(24 * T + 5, 5, 2, 2, 0x4a3320); tiles.rect(24 * T + 25, 5, 2, 2, 0x4a3320);
tiles.rect(24 * T, 0, 1, 9, 0x7a5230); tiles.rect(24 * T + T - 1, 0, 1, 9, 0x7a5230);
// 碎岩：和岩石同一块底子，稍微亮一点，几道深色裂缝从中间炸开，缝边一点亮色
tiles.rect(25 * T, 0, T, T, 0x6e7480);
tiles.rect(25 * T + 2, 4, 12, 10, 0x575d68); tiles.rect(25 * T + 18, 16, 12, 12, 0x575d68); tiles.rect(25 * T + 4, 20, 8, 8, 0x575d68);
tiles.rect(25 * T, 0, T, 2, 0x8a919e);
tiles.line(25 * T + 16, 15, 25 * T + 5, 3, 0x23262c); tiles.line(25 * T + 16, 15, 25 * T + 28, 6, 0x23262c);
tiles.line(25 * T + 16, 15, 25 * T + 9, 29, 0x23262c); tiles.line(25 * T + 16, 15, 25 * T + 26, 27, 0x23262c);
tiles.line(25 * T + 9, 29, 25 * T + 3, 24, 0x23262c, 1); tiles.line(25 * T + 28, 6, 25 * T + 30, 14, 0x23262c, 1);
tiles.rect(25 * T + 15, 13, 3, 3, 0x9aa1ad);
// 尖刺改挂在旁边（透明背景，和 4 号同色）：26 挂左墙、刺朝右；27 挂右墙、刺朝左；
// 28 两边都挂：把一边的刺缩小一半（尖 4 宽、伸出 7），每边上下各挂两排
for (let k = 0; k < 4; k++) {
  tiles.tri(26 * T, k * 8, 26 * T + 14, k * 8 + 4, 26 * T, k * 8 + 8, 0xef476f);
  tiles.tri(28 * T, k * 8, 28 * T - 14, k * 8 + 4, 28 * T, k * 8 + 8, 0xef476f);
}
for (let k = 0; k < 8; k++) {
  tiles.tri(28 * T, k * 4, 28 * T + 7, k * 4 + 2, 28 * T, k * 4 + 4, 0xef476f);
  tiles.tri(29 * T, k * 4, 29 * T - 7, k * 4 + 2, 29 * T, k * 4 + 4, 0xef476f);
}
tiles.save('tiles.png');

// ---- 玩家 32x32（一格）：圆角方块 + 一只眼睛 + 两只小脚。游戏里按 config.playerWidth / playerHeight 缩放 ----
const player = new Canvas(32, 32);
player.roundRect(1, 0, 30, 28, 7, 0x4cc9f0);             // 身体
player.rect(3, 2, 26, 3, 0x7ad8f5);                        // 顶部高光
player.roundRect(18, 8, 7, 8, 2, 0xffffff);               // 眼白
player.rect(21, 10, 3, 5, 0x0b0b14);                       // 眼珠（朝右）
player.rect(6, 28, 7, 4, 0x2a8fb8); player.rect(19, 28, 7, 4, 0x2a8fb8);   // 两只脚
player.save('player.png');

// ---- 长大后的玩家：第 2 关 32x48（1.5 格高）、第 3 关 32x64（2 格高）。同一个方块拉成长条，眼睛还在头部、脚还在底部（不是把 32x32 拉伸）----
const tallPlayer = (h, name) => {
  const c = new Canvas(32, h);
  c.roundRect(1, 0, 30, h - 4, 7, 0x4cc9f0);              // 身体
  c.rect(3, 2, 26, 3, 0x7ad8f5);                            // 顶部高光
  c.roundRect(18, 8, 7, 8, 2, 0xffffff);                   // 眼白
  c.rect(21, 10, 3, 5, 0x0b0b14);                           // 眼珠（朝右）
  c.rect(6, h - 4, 7, 4, 0x2a8fb8); c.rect(19, h - 4, 7, 4, 0x2a8fb8);   // 两只脚
  c.save(name);
};
tallPlayer(48, 'player_mid.png');
tallPlayer(64, 'player_tall.png');

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

// ---- 骷髅 28x36：红眼、红披风、金扣（参考用户给的形象）----
const sk = new Canvas(28, 36);
const bone = 0xf1efe6, dark = 0x0b0b14, shade = 0xc9c4b4, red = 0xb3121b, redDk = 0x6e0b12, gold = 0xffc94a, eye = 0xff1e1e;
// 披风：肩膀两侧张开，往下收
sk.tri(0, 15, 14, 12, 14, 36, redDk); sk.tri(28, 15, 14, 12, 14, 36, redDk);
sk.rect(3, 14, 22, 18, red); sk.rect(1, 16, 26, 10, red);
sk.rect(5, 30, 18, 3, redDk); sk.rect(3, 26, 22, 2, redDk);          // 褶皱阴影
sk.rect(9, 19, 10, 15, dark);                                         // 披风里面是黑的
// 头骨
sk.roundRect(6, 0, 16, 14, 5, bone);
sk.rect(8, 10, 12, 4, shade);
sk.rect(9, 4, 4, 4, dark); sk.rect(15, 4, 4, 4, dark);                // 眼窝
sk.rect(10, 5, 2, 2, eye); sk.rect(16, 5, 2, 2, eye);                 // 红眼
sk.rect(13, 8, 2, 2, dark);                                           // 鼻
sk.rect(10, 12, 8, 2, dark); sk.rect(11, 12, 1, 2, bone); sk.rect(13, 12, 1, 2, bone); sk.rect(15, 12, 1, 2, bone); // 牙
// 领口 + 金扣
sk.rect(8, 14, 12, 3, red); sk.rect(6, 17, 3, 3, gold); sk.rect(19, 17, 3, 3, gold);
sk.rect(7, 18, 1, 1, dark); sk.rect(20, 18, 1, 1, dark);
// 脊柱 / 肋骨露在披风开口里
sk.rect(13, 17, 2, 12, bone); sk.rect(10, 20, 8, 1, bone); sk.rect(10, 23, 8, 1, bone); sk.rect(11, 26, 6, 1, bone);
// 腿
sk.rect(10, 31, 3, 5, bone); sk.rect(15, 31, 3, 5, bone);
sk.save('skeleton.png');

// ---- 小城堡 128x112（通往下一层的门在正中底部）----
const ca = new Canvas(128, 112);
const wall = 0x6c7386, wallDk = 0x4f566a, wallLt = 0x8a92a8, roof = 0x9b2f3a, roofDk = 0x6e1f28, glow = 0xffd166;
const brick = (x, y, w, h) => { for (let j = y + 4; j < y + h; j += 8) for (let i = x + ((j / 8) & 1 ? 4 : 0); i < x + w - 2; i += 10) ca.rect(i + 1, j, 4, 2, wallDk); };
// 两侧塔楼
for (const tx of [0, 104]) {
  ca.rect(tx, 28, 24, 84, wall); ca.rect(tx, 28, 24, 2, wallLt); ca.rect(tx, 108, 24, 4, wallDk);
  for (let i = 0; i < 3; i++) ca.rect(tx + i * 9, 22, 6, 6, wall);              // 垛口
  ca.tri(tx - 2, 22, tx + 26, 22, tx + 12, 2, roof); ca.tri(tx + 2, 22, tx + 22, 22, tx + 12, 8, roofDk);
  ca.rect(tx + 9, 44, 6, 10, dark); ca.rect(tx + 9, 72, 6, 10, dark);          // 窗
  brick(tx, 30, 24, 78);
}
// 主体
ca.rect(20, 52, 88, 60, wall); ca.rect(20, 52, 88, 2, wallLt); ca.rect(20, 108, 88, 4, wallDk);
for (let i = 0; i < 9; i++) ca.rect(22 + i * 10, 46, 6, 6, wall);
brick(20, 54, 88, 54);
ca.rect(34, 62, 8, 12, dark); ca.rect(86, 62, 8, 12, dark);                      // 窗
ca.rect(36, 65, 4, 4, glow); ca.rect(88, 65, 4, 4, glow);
// 门：26x38 拱门，里面透光
ca.roundRect(50, 70, 28, 44, 13, wallDk);
ca.roundRect(52, 72, 24, 44, 11, dark);
ca.roundRect(58, 84, 12, 28, 5, 0x3a2a12);
ca.rect(62, 90, 4, 12, glow);
// 旗
ca.rect(63, 20, 2, 26, wallDk); ca.tri(65, 20, 65, 32, 79, 26, roof);
ca.save('castle.png');

// ---- 蜡烛 12x18（地上的道具，捡起来拿在右手）----
const cd = new Canvas(12, 18);
cd.rect(3, 8, 6, 10, 0xf1efe6); cd.rect(3, 8, 2, 10, 0xffffff); cd.rect(7, 8, 2, 10, 0xc9c4b4);   // 蜡身 + 高光 / 阴影
cd.rect(4, 17, 4, 1, 0xd9a066);                                                             // 底座一点暖色
cd.rect(5, 6, 2, 2, 0x3a2a12);                                                              // 烛芯
cd.tri(2, 6, 10, 6, 6, 0, 0xff9f1c); cd.tri(4, 6, 8, 6, 6, 2, 0xffd166); cd.rect(5, 4, 2, 2, 0xffffff); // 火苗
cd.save('candle.png');

// ---- 音量图标 24x24（设置房间里滑块左边的喇叭）----
const vo = new Canvas(24, 24);
vo.rect(2, 8, 6, 8, 0xf1efe6);                                   // 喇叭底座
vo.tri(8, 8, 8, 16, 15, 22, 0xf1efe6); vo.tri(8, 8, 15, 2, 15, 22, 0xf1efe6);   // 喇叭口
vo.rect(8, 8, 7, 8, 0xf1efe6);
vo.rect(3, 9, 2, 6, 0xc9c4b4); vo.rect(13, 3, 2, 18, 0xc9c4b4);  // 阴影
vo.save('volume.png');

// ---- 钥匙 16x16（白色，按组染色）----
const ky = new Canvas(16, 16);
ky.roundRect(1, 1, 8, 8, 4, 0xffffff); ky.rect(4, 4, 2, 2, 0x2a2a2a);     // 钥匙环
ky.rect(8, 8, 2, 2, 0xffffff); ky.line(8, 8, 14, 14, 0xffffff, 2);        // 钥匙杆
ky.rect(12, 9, 3, 2, 0xffffff); ky.rect(10, 11, 2, 2, 0xffffff);          // 齿
ky.save('key.png');

// ---- 吃豆人：豆子 / 大力丸 / 鬼巢门 / 葡萄 / 隧道标记 ----
const pe = new Canvas(8, 8); pe.roundRect(2, 2, 4, 4, 2, 0xffe8b0); pe.save('pellet.png');
const po = new Canvas(16, 16); po.roundRect(1, 1, 14, 14, 7, 0xffe8b0); po.roundRect(4, 3, 5, 4, 2, 0xffffff); po.save('power.png');
const gh = new Canvas(64, 16); gh.rect(0, 5, 64, 6, 0xffb3c6); gh.rect(0, 5, 64, 2, 0xffd6e0); gh.rect(0, 9, 64, 2, 0xd97a94); gh.save('ghosthouse.png');
const gr = new Canvas(20, 24);
gr.rect(9, 0, 2, 5, 0x5a3a1e); gr.tri(11, 1, 17, 0, 13, 5, 0x06d6a0);                       // 梗 + 叶
[[6, 6], [12, 6], [3, 11], [9, 11], [15, 11], [6, 16], [12, 16], [9, 21]].forEach(([x, y]) => { gr.roundRect(x - 3, y - 3, 7, 7, 3, 0x9b5de5); gr.rect(x - 2, y - 2, 2, 2, 0xc4a7ff); });
gr.save('grapes.png');
const tu = new Canvas(32, 32); for (let i = 0; i < 32; i += 8) tu.rect(i, 0, 4, 32, 0x4cc9f0); tu.save('tunnel.png');

// ---- 鬼 26x26：白色身体（运行时按只染色）+ 眼睛 + 惊吓脸 ----
const gb = new Canvas(26, 26);
gb.roundRect(0, 0, 26, 26, 13, 0xffffff); gb.rect(0, 13, 26, 9, 0xffffff);
[0, 7, 14, 21].forEach(x => gb.rect(x, 22, 5, 4, 0xffffff));                 // 波浪裙边
gb.save('ghost.png');
const gb2 = new Canvas(26, 26);                                               // 第二帧：裙边错开半格，走起来会摆
gb2.roundRect(0, 0, 26, 26, 13, 0xffffff); gb2.rect(0, 13, 26, 9, 0xffffff);
[3, 10, 17].forEach(x => gb2.rect(x, 22, 6, 4, 0xffffff)); gb2.rect(0, 22, 2, 3, 0xffffff); gb2.rect(24, 22, 2, 3, 0xffffff);
gb2.save('ghost2.png');
const ge = new Canvas(26, 26);
[[5, 7], [15, 7]].forEach(([x, y]) => { ge.roundRect(x, y, 7, 8, 3, 0xffffff); ge.rect(x + 3, y + 3, 3, 4, 0x2233cc); });
ge.save('ghosteyes.png');
const gs = new Canvas(26, 26);
gs.rect(7, 9, 3, 3, 0xffc2c2); gs.rect(16, 9, 3, 3, 0xffc2c2);                 // 小眼
[4, 8, 12, 16].forEach((x, i) => { gs.rect(x, 17 + (i % 2) * 2, 3, 2, 0xffc2c2); gs.rect(x + 3, 17 + ((i + 1) % 2) * 2, 2, 2, 0xffc2c2); });   // 锯齿嘴
gs.save('ghostscared.png');

// ---- 炸弹 22x22 ----
const bo = new Canvas(22, 22);
bo.roundRect(1, 5, 18, 17, 8, 0x1b1b24); bo.roundRect(4, 8, 6, 5, 2, 0x4a4a5c);   // 球体 + 高光
bo.rect(9, 2, 4, 4, 0x5a3a1e); bo.rect(13, 0, 3, 3, 0xffd166); bo.rect(14, 1, 1, 1, 0xffffff);   // 引信 + 火星
bo.save('bomb.png');

// ---- 帽子 32x32（一格）：黑色高脚帽，戴上后主角算两格高 ----
const hat = new Canvas(32, 32);
hat.roundRect(1, 26, 30, 6, 2, 0x16161e);                 // 帽檐
hat.roundRect(7, 2, 18, 25, 3, 0x1e1e28);                 // 帽筒
hat.rect(7, 19, 18, 4, 0xb3263a);                          // 红色帽带
hat.rect(9, 4, 3, 14, 0x3a3a4c);                           // 高光
hat.rect(8, 2, 16, 2, 0x2c2c3a);                           // 帽顶边
hat.save('hat.png');

// ---- 木箱：1x1（32x32）和 2x2（64x64）。可以推，有重力 ----
function crate(size, name, wood, dark, band) {
  const c = new Canvas(size, size), e = Math.max(3, size / 10) | 0;
  c.rect(0, 0, size, size, dark);
  c.rect(1, 1, size - 2, size - 2, wood);
  for (let y = e + size / 4; y < size - e; y += size / 4) c.rect(e, y | 0, size - 2 * e, 1, dark);   // 木板缝
  c.line(e, e, size - e, size - e, dark, Math.max(2, e - 1));                                        // 对角撑
  c.rect(0, 0, size, e, band); c.rect(0, size - e, size, e, band);                                    // 上下框
  c.rect(0, 0, e, size, band); c.rect(size - e, 0, e, size, band);                                    // 左右框
  for (const [x, y] of [[1, 1], [size - e + 1, 1], [1, size - e + 1], [size - e + 1, size - e + 1]]) c.rect(x, y, e - 2, e - 2, 0xd9d9d9);   // 四角钉
  c.save(name);
}
crate(32, 'crate1.png', 0xb07a45, 0x6b4423, 0x8a5a30);
crate(64, 'crate2.png', 0x8f6a4a, 0x4a3320, 0x5d6470);    // 大箱子：深一点、铁框，一眼能分出来


// ---- 压板：1x1（32x32）和 1x2（64x32），各一张没压 / 压下。贴在格子底部的一块踏板，正中间是红色的引线头；
//      箱子压上去就点燃连着它的引线（引线在压板旁边的那一头不单独画，也点不着，只能靠压板） ----
function plate(w, name, down) {
  const c = new Canvas(w, 32), top = down ? 26 : 21, cx = w / 2;
  c.roundRect(1, 27, w - 2, 5, 1, 0x3a3a4c);                       // 底座
  c.roundRect(4, top, w - 8, down ? 3 : 6, 2, down ? 0xa87c30 : 0xd9a441);   // 踏板（压下去就扁、暗）
  if (!down) c.rect(6, top, w - 12, 2, 0xf2cf7a);                  // 高光
  c.roundRect(cx - 4, top - 5, 8, 7, 3, 0xb3263a);                  // 红色引线头
  c.rect(cx - 2, top - 4, 2, 2, down ? 0xd9d9d9 : 0xff8f8f);        // 引线头高光（压下变灰：已经点过）
  c.save(name);
}
plate(32, 'plate1.png', false);
plate(32, 'plate1_down.png', true);
plate(64, 'plate2.png', false);
plate(64, 'plate2_down.png', true);

// ---- 骷髅手的骨头：骨头、阴影、描边三色；一串点连成一节节骨头，关节处画圆 ----
const HB = 0xe8dfc9, HS = 0xb9ad94, HO = 0x2a1f35;
const boneSeg = (c, pts, t) => {
  for (let i = 1; i < pts.length; i++) c.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], HO, t + 4);
  for (let i = 1; i < pts.length; i++) c.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], HB, t);
  for (let i = 1; i < pts.length; i++) c.line(pts[i - 1][0] + 1, pts[i - 1][1] + 1, pts[i][0] + 1, pts[i][1] + 1, HS, Math.max(1, t - 4));
  pts.slice(0, -1).forEach(([x, y]) => { c.roundRect(x - t / 2 - 1, y - t / 2 - 1, t + 2, t + 2, (t + 2) / 2, HO); c.roundRect(x - t / 2, y - t / 2, t, t, t / 2, HB); });
};
/** 圆的小骨头（腕骨、骨头末端的疙瘩） */
const boneKnob = (c, x, y, r) => { c.roundRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2, r + 1, HO); c.roundRect(x - r, y - r, 2 * r, 2 * r, r, HB); };

// ---- 复活时把玩家放回来的骷髅手：160x160，两帧（捏着 / 张开）。手臂从左上角伸进来，
//      捏合点（玩家身体中心放的位置）在 (104, 120)，和 asset/index.ts 的 RESPAWN_HAND.pinch 一致。紫色光雾在游戏里用粒子画 ----
{
  const knuckles = [[84, 84], [98, 74], [106, 74], [114, 80], [120, 88]];
  const hand = (fingers, name) => {
    const c = new Canvas(160, 160);
    boneSeg(c, [[-6, 12], [60, 64]], 8);                       // 尺骨
    boneSeg(c, [[6, -4], [68, 56]], 7);                        // 桡骨
    [[64, 60], [72, 58], [68, 68], [76, 66], [72, 76]].forEach(([x, y]) => { c.roundRect(x - 6, y - 6, 12, 12, 6, HO); c.roundRect(x - 5, y - 5, 10, 10, 5, HB); });   // 腕骨
    knuckles.forEach(k => boneSeg(c, [[72, 68], k], 5));      // 掌骨
    fingers.forEach((f, i) => boneSeg(c, [knuckles[i], ...f], i === 0 ? 6 : 5));
    c.save(name);
  };
  // 捏着：拇指在玩家左边，四根手指从右上绕下来扣住右边
  hand([[[84, 100], [88, 114]], [[112, 80], [124, 92], [122, 106]], [[122, 84], [130, 100], [126, 116]], [[128, 94], [132, 112], [126, 126]], [[130, 106], [128, 122], [122, 132]]], 'hand_hold.png');
  // 张开：拇指往左下、四指往右下散开
  hand([[[78, 98], [70, 112]], [[118, 74], [136, 80], [146, 90]], [[126, 80], [144, 92], [152, 106]], [[132, 92], [146, 108], [150, 124]], [[134, 104], [140, 120], [138, 136]]], 'hand_open.png');
}

// ---- 第四面墙那只抓画面的骷髅手：手心朝镜头，手臂从左边水平伸进来，拇指朝上、四指朝右（右手）。
//      grab_hand.png：6 帧横排（每帧 380x200），从张开一路攥成拳头。手臂伸到画布左边外面，放大后手臂末端在屏幕外。
//      拳心（纸团放的位置）在每帧的 (248, 102)，和 asset/index.ts 的 GRAB_HAND.grip 一致 ----
{
  const FW = 380, FH = 200, CURL = [0, 0.2, 0.42, 0.65, 0.85, 1];
  const rad = (d) => d * Math.PI / 180;
  /** 朝镜头弯过来的那部分在画面上往右下偏一点，看着有前后 */
  const DEPTH = [0.14, 0.1];
  /**
   * 一根手指：从指根关节 base 沿 dir 度方向伸出去，三节长 lens；curl 0..1 时每个关节弯 flex·curl 度（朝镜头弯），
   * 弯过 90° 的部分就折回来盖在手掌上
   */
  const finger = (base, dir, lens, curl, flex = [85, 100, 60]) => {
    const pts = [base], ca = Math.cos(rad(dir)), sa = Math.sin(rad(dir));
    let [x, y] = base, phi = 0;
    lens.forEach((L, i) => {
      phi += rad(flex[i] * curl);
      const along = Math.cos(phi) * L, depth = Math.sin(phi) * L;
      x += along * ca + depth * DEPTH[0]; y += along * sa + depth * DEPTH[1];
      pts.push([x, y]);
    });
    return pts;
  };
  /** 拇指：每节 [长度, 张开时的方向, 握拳时的方向]（度）：张开朝右上翘，握拳时折下来压在四指上 */
  const thumb = (base, curl) => {
    const pts = [base];
    let [x, y] = base;
    for (const [L, a0, a1] of [[30, -56, -16], [24, -60, 10], [18, -64, 38]]) {
      const a = rad(a0 + (a1 - a0) * curl);
      x += Math.cos(a) * L; y += Math.sin(a) * L;
      pts.push([x, y]);
    }
    return pts;
  };
  // 四根手指（食指在上，小指在下）：掌骨起点、指根关节、方向、三节长度
  const FINGERS = [
    { from: [212, 86], knuckle: [262, 76], dir: -7, lens: [40, 24, 18] },
    { from: [214, 97], knuckle: [268, 93], dir: -2, lens: [44, 27, 19] },
    { from: [214, 109], knuckle: [265, 110], dir: 3, lens: [41, 25, 18] },
    { from: [211, 120], knuckle: [256, 126], dir: 9, lens: [32, 20, 15] },
  ];
  const CARPALS = [[196, 84], [207, 81], [198, 96], [210, 94], [199, 108], [210, 107], [200, 120], [211, 119]];
  const sheet = new Canvas(FW * CURL.length, FH);
  CURL.forEach((curl, f) => {
    // 每帧单独画再贴上去：画出这一帧边界的部分（前臂从画布左边外面伸进来）就裁掉了，不会渗到隔壁帧
    const c = new Canvas(FW, FH);
    // 前臂：桡骨（拇指那侧，上）、尺骨（下），手腕那头有个疙瘩；画布左边外面还有，放大后在屏幕外
    boneSeg(c, [[-8, 88], [188, 88]], 11); boneKnob(c, 186, 88, 9);
    boneSeg(c, [[-8, 116], [186, 116]], 10); boneKnob(c, 184, 116, 8);
    CARPALS.forEach(([x, y]) => boneKnob(c, x, y, 7));                     // 腕骨
    FINGERS.forEach(g => boneSeg(c, [g.from, g.knuckle], 7));              // 掌骨
    [...FINGERS].reverse().forEach(g => boneSeg(c, finger(g.knuckle, g.dir, g.lens, curl), 7));   // 手指：从小指画到食指
    boneSeg(c, thumb([206, 82], curl), 7);                                 // 拇指最后画，握拳时横压在食指、中指上
    sheet.blit(c, f * FW, 0);
  });
  sheet.save('grab_hand.png');
}
