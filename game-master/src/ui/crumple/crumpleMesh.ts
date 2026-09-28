// ===== 捏纸团的网格：把一张图（冻住的游戏画面）当成一张纸，被一只手捏成一团 =====
// 纯计算，不碰 DOM / WebGL：给定进度算出每个三角形的顶点（位置、贴图坐标、明暗、正反面），交给 CrumpleGL 画。
// - 纸被分成一片片（大 Voronoi 格）：揉的时候每片绕自己中心转一点、缩一点、歪一点，片与片之间就折出又直又尖的折痕，边缘参差；
// - 每片上再叠两层「金字塔」起伏（F2−F1，随机凸或凹），是细一些的褶子；
// - 成团：从捏住的那一点开始由近到远（每片早晚随机差一点）包到攥在拳心的一个球上，边角最后卷进去、藏在背面；
//   球面上撒一把 Voronoi 金字塔当坑洼，坑里压暗，看着是揉皱的纸团而不是光滑的球。

/** 每个顶点几个 float：x, y, z, u, v, 明暗, 露出画面的程度（1 = 正面的画面，0 = 纸背面 / 褶缝里裂开露出的白纸） */
export const VERTEX_FLOATS = 7;

export interface Vec2 { x: number; y: number }

export interface CrumpleOptions {
  /** 纸的矩形（像素） */
  x: number; y: number; w: number; h: number;
  /** 手捏住纸的那一点（像素，和纸同一个坐标系） */
  grab: Vec2;
  /** 网格一格大约多少像素：越小褶子越细、三角形越多 */
  cell?: number;
  /** 随机种子：同一个种子每次捏出来的褶子一样 */
  seed?: number;
}

export interface CrumpleState {
  /** 捏皱进度：0 = 平整，1 = 完全成团 */
  crumple: number;
  /** 捏住那一下把纸提起来：0..1（捏住的地方鼓起、出现一圈辐射状的褶子） */
  pinch: number;
  /** 最后再捏紧一下：纸团缩小 0..1 */
  squeeze: number;
  /** 拳心现在的位置：纸团的球心，纸跟着它走 */
  hand: Vec2;
  /** 扔出去时纸团整团转：绕屏幕法线转多少弧度、左右翻滚多少弧度、缩到多大（越飞越远） */
  spin?: number;
  tumble?: number;
  ballScale?: number;
}

/** 手感参数（长度都是纸面积开方 √(w·h) 的倍数，换屏幕大小比例不变） */
const TUNE = {
  /** 由近到远卷进纸团的拖后程度（越大，远处越晚才开始卷）；每一片早晚再随机差多少 */
  lag: 1.4, lagJitter: 0.05,
  /** 纸团半径；球心在拳心下方多少个半径（0 = 就在拳心） */
  ballRadius: 0.12, ballHang: 0,
  /** 纸团上「纸中心」那一面朝上偏多少弧度；卷进去时顺带拧的角度 */
  ballTilt: 0.3, twist: 0.9,
  /** 纸片（大格）的大小；揉的时候每片最多转多少弧度、缩多少、歪多少（高度 / 距离） */
  flapCell: 0.2, flapTurn: 0.22, flapShrink: 0.25, flapTilt: 0.6,
  /** 细褶子：两层金字塔的格子大小和高度；起伏倍数（越大折面越陡、明暗越强） */
  folds: [{ cell: 0.22, amp: 1 }, { cell: 0.11, amp: 0.45 }], foldHeight: 0.6,
  /** 纸团：表面坑洼（半径的比例）、球面上几块、坑里压多暗、折痕上的墨裂开露出多少白纸 */
  lumps: 0.28, lumpCells: 70, crease: 0.45, inkCrack: 0.55,
  /** 捏住时提起的高度，辐射褶子的条数和深浅，附近的纸往手那边收多少 */
  lift: 0.12, rays: 9, rayDepth: 0.3, pinchPull: 0.08,
  /** 还没卷进去的纸整体往手那边收多少 */
  gather: 0.3,
  /** 光从左上方照过来（x 右、y 下、z 朝屏幕外）；明暗对比和上下限 */
  light: [-0.45, -0.65, 0.62] as const, contrast: 1.2, shadeMin: 0.25, shadeMax: 1.45,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const smoothstep = (e0: number, e1: number, v: number) => smooth01((v - e0) / (e1 - e0));
/** 三角波 0..1..0，周期 1：辐射褶子用（折痕是尖的） */
const tri = (v: number) => Math.abs(2 * (v - Math.floor(v + 0.5)));

/** 可复现的随机数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在矩形（四边各外扩半格）里撒种子，每个点记下最近种子的编号和 F2−F1 */
function voronoi(px: Float32Array, py: Float32Array, o: CrumpleOptions, cs: number, rand: () => number) {
  const count = Math.max(4, Math.round((o.w + cs) * (o.h + cs) / (cs * cs)));
  const sx = new Float32Array(count), sy = new Float32Array(count);
  for (let k = 0; k < count; k++) { sx[k] = o.x - cs / 2 + rand() * (o.w + cs); sy[k] = o.y - cs / 2 + rand() * (o.h + cs); }
  const nearest = new Int32Array(px.length), edge = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) {
    let d1 = Infinity, d2 = Infinity, k1 = 0;
    for (let k = 0; k < count; k++) {
      const d = Math.hypot(px[i] - sx[k], py[i] - sy[k]);
      if (d < d1) { d2 = d1; d1 = d; k1 = k; } else if (d < d2) d2 = d;
    }
    nearest[i] = k1; edge[i] = d2 - d1;
  }
  return { count, sx, sy, nearest, edge };
}

export class CrumpleMesh {
  readonly cols: number;
  readonly rows: number;
  /** 三角形的顶点数（每格两个三角形，顶点不共用，这样每个面可以单独算明暗） */
  readonly vertexCount: number;
  private readonly size: number;
  private readonly far: number;
  private readonly grab: Vec2;
  // 网格点（(cols+1)·(rows+1) 个）的静态数据
  private readonly u: Float32Array;
  private readonly v: Float32Array;
  /** 离捏住点的距离、占最远距离的比例、方向角 */
  private readonly dist: Float32Array;
  private readonly rho: Float32Array;
  private readonly ang: Float32Array;
  /** 属于哪一片纸，离那片中心的偏移 */
  private readonly flap: Int32Array;
  private readonly lx: Float32Array;
  private readonly ly: Float32Array;
  /** 细褶子高度（像素）、辐射褶子（0..1）、纸团表面坑洼（约 −1..1） */
  private readonly fold: Float32Array;
  private readonly ray: Float32Array;
  private readonly lump: Float32Array;
  /** 每一片纸：中心、转多少、缩多少、往哪边歪、卷进去早晚差多少 */
  private readonly flaps: { x: Float32Array; y: Float32Array; turn: Float32Array; shrink: Float32Array; tx: Float32Array; ty: Float32Array; lag: Float32Array };
  // 每帧算出来的网格点位置、褶缝的暗度、露出白纸的程度
  private readonly X: Float32Array;
  private readonly Y: Float32Array;
  private readonly Z: Float32Array;
  private readonly ao: Float32Array;
  private readonly crack: Float32Array;

  constructor(o: CrumpleOptions) {
    const cell = o.cell ?? 18;
    this.cols = Math.max(2, Math.round(o.w / cell));
    this.rows = Math.max(2, Math.round(o.h / cell));
    this.vertexCount = this.cols * this.rows * 6;
    this.size = Math.sqrt(o.w * o.h);
    this.grab = { ...o.grab };
    const n = (this.cols + 1) * (this.rows + 1);
    const f32 = () => new Float32Array(n);
    this.u = f32(); this.v = f32(); this.dist = f32(); this.rho = f32(); this.ang = f32();
    this.lx = f32(); this.ly = f32(); this.fold = f32(); this.ray = f32(); this.lump = f32();
    this.X = f32(); this.Y = f32(); this.Z = f32(); this.ao = f32(); this.crack = f32();

    const px = f32(), py = f32();
    let far = 1;
    for (let r = 0, i = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++, i++) {
        this.u[i] = c / this.cols; this.v[i] = r / this.rows;
        px[i] = o.x + this.u[i] * o.w; py[i] = o.y + this.v[i] * o.h;
        const dx = px[i] - o.grab.x, dy = py[i] - o.grab.y;
        this.dist[i] = Math.hypot(dx, dy); this.ang[i] = Math.atan2(dy, dx);
        far = Math.max(far, this.dist[i]);
      }
    }
    this.far = far;
    for (let i = 0; i < n; i++) this.rho[i] = this.dist[i] / far;

    const rand = rng(o.seed ?? 7);
    const signed = () => (rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * rand());
    // 纸片
    const fl = voronoi(px, py, o, TUNE.flapCell * this.size, rand);
    const m = fl.count, turn = new Float32Array(m), shrink = new Float32Array(m), tx = new Float32Array(m), ty = new Float32Array(m), lag = new Float32Array(m);
    for (let k = 0; k < m; k++) {
      turn[k] = signed() * TUNE.flapTurn; shrink[k] = rand() * TUNE.flapShrink;
      const a = rand() * Math.PI * 2, s = (0.4 + 0.6 * rand()) * TUNE.flapTilt;
      tx[k] = Math.cos(a) * s; ty[k] = Math.sin(a) * s;
      lag[k] = (rand() * 2 - 1) * TUNE.lagJitter;
    }
    this.flaps = { x: fl.sx, y: fl.sy, turn, shrink, tx, ty, lag };
    this.flap = fl.nearest;
    for (let i = 0; i < n; i++) { this.lx[i] = px[i] - fl.sx[fl.nearest[i]]; this.ly[i] = py[i] - fl.sy[fl.nearest[i]]; }
    // 细褶子：金字塔，按最近种子的正负号凸或凹
    for (const layer of TUNE.folds) {
      const vo = voronoi(px, py, o, layer.cell * this.size, rand);
      const sign = Float32Array.from({ length: vo.count }, signed);
      for (let i = 0; i < n; i++) this.fold[i] += layer.amp * sign[vo.nearest[i]] * vo.edge[i];
    }
    // 辐射褶子：绕捏住点一圈 rays 条，角度上加一点不规则
    const p1 = rand() * 6.283, p2 = rand() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = this.ang[i];
      this.ray[i] = tri(TUNE.rays * a / 6.283 + 0.25 * Math.sin(3 * a + p1) + 0.15 * Math.sin(5 * a + p2));
    }
    // 纸团表面：球面上撒 lumpCells 个点，按每个网格点最后落在球上的方向取 F2−F1（角度），随机凸或凹
    const L = TUNE.lumpCells, lsx = new Float32Array(L), lsy = new Float32Array(L), lsz = new Float32Array(L), lsign = new Float32Array(L);
    for (let k = 0; k < L; k++) {
      const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      lsx[k] = r * Math.cos(a); lsy[k] = r * Math.sin(a); lsz[k] = z; lsign[k] = signed();
    }
    const spacing = Math.sqrt(4 * Math.PI / L);
    for (let i = 0; i < n; i++) {
      const d = this.ballDir(i, 1);
      let a1 = Infinity, a2 = Infinity, k1 = 0;
      for (let k = 0; k < L; k++) {
        const a = Math.acos(Math.max(-1, Math.min(1, d.x * lsx[k] + d.y * lsy[k] + d.z * lsz[k])));
        if (a < a1) { a2 = a1; a1 = a; k1 = k; } else if (a < a2) a2 = a;
      }
      this.lump[i] = lsign[k1] * (a2 - a1) / spacing;
    }
  }

  /** 纸团半径（像素，没捏紧时） */
  get ballRadius(): number { return TUNE.ballRadius * this.size; }

  /** ballDir 的结果（复用，免得每帧建几千个对象） */
  private readonly dir = { x: 0, y: 0, z: 0 };

  /** 第 i 个网格点在纸团上的方向（单位向量，球心为原点，z 朝屏幕外），写进 this.dir；c 是捏皱进度（决定拧了多少） */
  private ballDir(i: number, c: number): { x: number; y: number; z: number } {
    const rho = this.rho[i];
    const th = Math.PI * Math.pow(rho, 0.85);   // 离捏住点越远，包到球上越靠后
    const ph = this.ang[i] + TUNE.twist * rho * c;
    const st = Math.sin(th), dx = st * Math.cos(ph), dy = st * Math.sin(ph), dz = Math.cos(th);
    const ct = Math.cos(TUNE.ballTilt), sn = Math.sin(TUNE.ballTilt);
    // 正面朝上转一点
    this.dir.x = dx; this.dir.y = dy * ct - dz * sn; this.dir.z = dy * sn + dz * ct;
    return this.dir;
  }

  /** 按进度算出所有三角形的顶点，写进 out（长度至少 vertexCount · VERTEX_FLOATS） */
  update(s: CrumpleState, out: Float32Array): void {
    const c = clamp01(s.crumple), pn = clamp01(s.pinch), sq = clamp01(s.squeeze);
    const { X, Y, Z, ao, crack, size, far, flaps, grab } = this;
    const R = TUNE.ballRadius * size * (1 - 0.2 * sq);
    const bx = s.hand.x, by = s.hand.y + TUNE.ballHang * R;
    const foldAmp = TUNE.foldHeight * smoothstep(0, 0.5, c);
    const flapAmt = smoothstep(0.05, 0.6, c);
    const lumpAmp = TUNE.lumps * smoothstep(0.2, 1, c);
    const gather = 1 - TUNE.gather * c;
    const lift = pn * TUNE.lift * size * (1 - c), liftR = 0.25 * far;
    const rayAmp = pn * TUNE.rayDepth, rayR = 0.3 * far;

    for (let i = 0; i < X.length; i++) {
      const d = this.dist[i], k = this.flap[i];
      // 这一片纸绕自己中心转、缩、歪
      const tn = flaps.turn[k] * flapAmt, sh = 1 - flaps.shrink[k] * flapAmt;
      const cs = Math.cos(tn) * sh, sn = Math.sin(tn) * sh;
      const fx = flaps.x[k] + this.lx[i] * cs - this.ly[i] * sn;
      const fy = flaps.y[k] + this.lx[i] * sn + this.ly[i] * cs;
      // 还没卷进去的纸：整体往手那边收；刚捏住时捏住的地方鼓起、一圈辐射褶子
      const near = Math.exp(-d / rayR);
      const kk = gather - TUNE.pinchPull * pn * near;
      const sx = s.hand.x + (fx - grab.x) * kk;
      const sy = s.hand.y + (fy - grab.y) * kk;
      const a = smooth01(c * (1 + TUNE.lag) - (this.rho[i] + flaps.lag[k]) * TUNE.lag);
      const sz = foldAmp * this.fold[i]
        + flapAmt * (flaps.tx[k] * this.lx[i] + flaps.ty[k] * this.ly[i])
        + lift * Math.exp(-(d * d) / (liftR * liftR))
        + rayAmp * this.ray[i] * d * near * (1 - a);
      // 纸团上的位置
      const dir = this.ballDir(i, c);
      const r = R * (1 + lumpAmp * this.lump[i]);
      X[i] = sx + (bx + r * dir.x - sx) * a;
      Y[i] = sy + (by + r * dir.y - sy) * a;
      Z[i] = sz + (r * dir.z - sz) * a;
      // 纸团上凹下去的褶缝压暗；坑洼的棱上（F2−F1 接近 0）墨裂开，露出白纸
      ao[i] = 1 - a * TUNE.crease * (1 - smoothstep(-0.8, 0.6, this.lump[i]));
      crack[i] = a * TUNE.inkCrack * (1 - smoothstep(0, 0.3, Math.abs(this.lump[i])));
    }
    this.turnBall(bx, by, s.spin ?? 0, s.tumble ?? 0, s.ballScale ?? 1);

    // 对角线方向隔格交替，不然整张纸的明暗会露出一排排同向的斜纹
    const w = this.cols + 1;
    let o = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c2 = 0; c2 < this.cols; c2++) {
        const i00 = r * w + c2, i10 = i00 + 1, i01 = i00 + w, i11 = i01 + 1;
        if ((r + c2) % 2) {
          o = this.face(i00, i10, i11, out, o);
          o = this.face(i00, i11, i01, out, o);
        } else {
          o = this.face(i00, i10, i01, out, o);
          o = this.face(i10, i11, i01, out, o);
        }
      }
    }
  }

  /** 整团绕球心转、缩（扔出去的时候）：先左右翻滚（绕竖直轴），再在屏幕里转。明暗每帧按面的朝向重算，转起来光影跟着变 */
  private turnBall(cx: number, cy: number, spin: number, tumble: number, scale: number): void {
    if (spin === 0 && tumble === 0 && scale === 1) return;
    const { X, Y, Z } = this;
    const cs = Math.cos(spin) * scale, ss = Math.sin(spin) * scale, ct = Math.cos(tumble), st = Math.sin(tumble);
    for (let i = 0; i < X.length; i++) {
      const x = X[i] - cx, y = Y[i] - cy, z = Z[i];
      const x1 = x * ct - z * st, z1 = x * st + z * ct;
      X[i] = cx + x1 * cs - y * ss; Y[i] = cy + x1 * ss + y * cs; Z[i] = z1 * scale;
    }
  }

  /** 写一个三角形：按面的朝向算明暗（平面着色，折痕才是尖的）；面翻过去了就是纸的背面 */
  private face(a: number, b: number, c: number, out: Float32Array, o: number): number {
    const { X, Y, Z, ao, crack } = this;
    const ex = X[b] - X[a], ey = Y[b] - Y[a], ez = Z[b] - Z[a];
    const fx = X[c] - X[a], fy = Y[c] - Y[a], fz = Z[c] - Z[a];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) { nx = 0; ny = 0; nz = 1; } else { nx /= len; ny /= len; nz /= len; }
    const front = nz >= 0;
    if (!front) { nx = -nx; ny = -ny; nz = -nz; }
    const ink = front ? 1 - (crack[a] + crack[b] + crack[c]) / 3 : 0;
    const [lx, ly, lz] = TUNE.light, ll = Math.hypot(lx, ly, lz);
    const lit = (nx * lx + ny * ly + nz * lz) / ll - lz / ll;   // 平放的纸 = 0：和原画面一样亮
    const shade = Math.min(TUNE.shadeMax, Math.max(TUNE.shadeMin, 1 + TUNE.contrast * lit)) * (ao[a] + ao[b] + ao[c]) / 3;
    o = this.put(a, shade, ink, out, o);
    o = this.put(b, shade, ink, out, o);
    return this.put(c, shade, ink, out, o);
  }

  private put(i: number, shade: number, ink: number, out: Float32Array, o: number): number {
    out[o] = this.X[i]; out[o + 1] = this.Y[i]; out[o + 2] = this.Z[i];
    out[o + 3] = this.u[i]; out[o + 4] = this.v[i];
    out[o + 5] = shade; out[o + 6] = ink;
    return o + VERTEX_FLOATS;
  }
}
