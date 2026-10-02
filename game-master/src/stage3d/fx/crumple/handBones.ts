// ===== 骷髅手的骨架（纯计算）：给定握拳程度，算出每根骨头的两端和粗细 =====
// 和 grab_hand.png（scripts/gen-art.mjs 画的那只手）是同一副骨架、同样的尺寸，只是这里是真的三维：
// 手指一节节朝手心那边弯过去，握拳时指尖绕到前面扣住纸团。
// 坐标：原点在拳心，x 朝指尖（右），y 朝下，z 朝手背；单位是贴图像素（GRAB_HAND 一帧里的像素）。手心朝 -z。

export type P3 = [number, number, number];
/** 一根骨头：两端、半径 */
export interface Bone { a: P3; b: P3; r: number }
/** 一个骨节（腕骨、关节上的疙瘩）：位置、半径 */
export interface Knob { at: P3; r: number }

/** 拳心在一帧贴图里的位置（和 asset/index.ts 的 GRAB_HAND.grip 对应：248 / 380, 102 / 200） */
const GRIP = [248, 102] as const;
/** 骨头粗细（半径） */
const R = { finger: 3.5, carpal: 6, wrist: [8, 7] as const };
/** 四根手指（食指在上，小指在下）：掌骨起点、指根关节、方向（度）、三节长度 */
const FINGERS = [
  { from: [212, 86], knuckle: [262, 76], dir: -7, lens: [40, 24, 18] },
  { from: [214, 97], knuckle: [268, 93], dir: -2, lens: [44, 27, 19] },
  { from: [214, 109], knuckle: [265, 110], dir: 3, lens: [41, 25, 18] },
  { from: [211, 120], knuckle: [256, 126], dir: 9, lens: [32, 20, 15] },
] as const;
/** 握紧时三个指关节各弯多少度 */
const FLEX = [85, 100, 60] as const;
/** 拇指：指根，每节 [长度, 张开时的方向, 握拳时的方向]（度），握拳时每节往手心那边压多少 */
const THUMB = { base: [206, 82], segs: [[30, -56, -16], [24, -60, 10], [18, -64, 38]], press: 12 } as const;
const CARPALS = [[196, 84], [207, 81], [198, 96], [210, 94], [199, 108], [210, 107], [200, 120], [211, 119]] as const;
/** 前臂两根骨头接在手腕的哪（桡骨在上、尺骨在下） */
const WRISTS = [[188, 88], [186, 116]] as const;

const rad = (d: number) => d * Math.PI / 180;
const at = (x: number, y: number, z = 0): P3 => [x - GRIP[0], y - GRIP[1], z];

export interface HandBones {
  bones: Bone[];
  knobs: Knob[];
  /** 前臂两根骨头接在手腕的哪（手这一头） */
  wrists: [P3, P3];
}

/** curl：0 = 张开，1 = 握成拳 */
export function handBones(curl: number): HandBones {
  const c = Math.max(0, Math.min(1, curl));
  const bones: Bone[] = [], knobs: Knob[] = [];
  const chain = (pts: P3[]) => {
    for (let i = 1; i < pts.length; i++) bones.push({ a: pts[i - 1], b: pts[i], r: R.finger });
    pts.forEach(p => knobs.push({ at: p, r: R.finger }));
  };
  CARPALS.forEach(([x, y]) => knobs.push({ at: at(x, y), r: R.carpal }));
  for (const f of FINGERS) {
    const pts: P3[] = [at(f.from[0], f.from[1]), at(f.knuckle[0], f.knuckle[1])];
    const ca = Math.cos(rad(f.dir)), sa = Math.sin(rad(f.dir));
    let [x, y, z] = pts[1], phi = 0;
    f.lens.forEach((len, i) => {
      phi += rad(FLEX[i] * c);
      const along = Math.cos(phi) * len;
      x += along * ca; y += along * sa; z -= Math.sin(phi) * len;   // 朝手心（-z）弯
      pts.push([x, y, z]);
    });
    chain(pts);
  }
  const thumb: P3[] = [at(THUMB.base[0], THUMB.base[1])];
  let [x, y, z] = thumb[0];
  for (const [len, open, closed] of THUMB.segs) {
    const a = rad(open + (closed - open) * c);
    const dz = THUMB.press * c, flat = Math.sqrt(len * len - dz * dz);   // 往手心压了多少，平面里就短多少：骨头不变长
    x += Math.cos(a) * flat; y += Math.sin(a) * flat; z -= dz;
    thumb.push([x, y, z]);
  }
  chain(thumb);
  const wrists: [P3, P3] = [at(WRISTS[0][0], WRISTS[0][1]), at(WRISTS[1][0], WRISTS[1][1])];
  wrists.forEach((p, i) => knobs.push({ at: p, r: R.wrist[i] }));
  return { bones, knobs, wrists };
}
