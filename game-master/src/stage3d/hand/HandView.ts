// ===== 画木手的那块透明画布：盖在界面上，只画这只手（和 3D 舞台无关，不碰游戏画布）=====
// 正交相机，1 个单位 = 页面 1 像素。画布的像素比页面粗（一个像素 = 游戏画布在页面上的一个像素 × config.pixel），
// 由 CSS 按像素放大（image-rendering: pixelated）——像素风和游戏画面一致。
// 每帧：姿势交叉过渡 → 手挪向目标（缓动和以前的 CSS 精灵一样）→ 把对准点（指尖 / 捏合点 / 手心）放到 at →
// 前臂拉到画面外 → 先画一遍偏下的黑色剪影当影子，再画手。
import * as THREE from 'three';
import type { HandPose } from '@/protocol';
import type { GmHandConfig } from '@/type';
import { HandModel, type HandAnchor } from './HandModel';
import { ToonPaletteMaterial, type ToonPalette } from './ToonPaletteMaterial';
import { armReach, easeMove, handOrientation, lerpAngle, toPage, type HandFrom, type Pt } from './placement';

export interface HandViewState {
  /** 对准的那一点（页面像素，相对画布左上角）；拿手的哪一点去对 */
  at: Pt;
  anchor: HandAnchor;
  pose: HandPose;
  from: HandFrom;
  /** 这一次挪过去用多久（毫秒）；0 = 一下子到 */
  ms: number;
  /** 再多转几度（甩、扫） */
  tilt: number;
  tremble: boolean;
  hidden: boolean;
  /** 手多长（页面像素）；null = 按 config.length 占画布高 */
  length: number | null;
  /** 手里拎着的东西（主角）：画在整只手前面 */
  held: HeldSprite | null;
}

/** 被拎着的一张贴图：图的地址、这一帧在图里的像素范围、画在哪（中心，页面像素）、多大、左右翻 */
export interface HeldSprite { url: string; frame: { x: number; y: number; w: number; h: number }; at: Pt; w: number; h: number; flipX: boolean }

export interface HandViewOptions {
  modelUrl: string;
  /** 材质名 → 调色板 */
  palette: Record<string, ToonPalette>;
  /** 每帧现取：调参面板改了立刻生效 */
  config(): GmHandConfig;
  /** 画布在页面上多大；一个像素多大（页面像素） */
  measure(): { w: number; h: number; pixel: number };
}

/** 发抖：每 70 毫秒一圈，四个位置（和以前 CSS 的 hand-tremble 一样） */
const TREMBLE: Pt[] = [{ x: 0, y: 0 }, { x: 2, y: -2 }, { x: -2, y: 1 }, { x: 1, y: 2 }];
const TREMBLE_STEP_MS = 70 / TREMBLE.length;

interface Placed { x: number; y: number; angle: number }

export class HandView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  private readonly materials = new Map<string, ToonPaletteMaterial>();
  private readonly shadow = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float opacity; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, opacity); }',
    uniforms: { opacity: { value: 0.45 } },
    blending: THREE.NoBlending,   // 直接盖上去：剪影自己叠自己也不会更黑
  });
  /** 拎着的贴图：一块平面，按帧改贴图坐标；颜色原样输出，透明的地方不画 */
  private readonly held = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb, 1.0); }',
    uniforms: { map: { value: null } },
  }));
  private readonly textures = new Map<string, THREE.Texture>();
  private model: HandModel | null = null;
  private state: HandViewState | null = null;
  /** 现在画在哪（挪动中是插值的位置）、这一次挪动从哪开始 */
  private shown: Placed = { x: 0, y: 0, angle: 0 };
  private tween: { from: Placed; to: Placed; start: number; ms: number } | null = null;
  private size = { w: 1, h: 1, pixel: 1 };
  private raf = 0;
  private last = 0;
  private disposed = false;
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();

  /** 没有 WebGL 时抛错 */
  constructor(canvas: HTMLCanvasElement, private readonly o: HandViewOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.held.visible = false;
    this.scene.add(this.held);
    this.layout();
    HandModel.load(o.modelUrl, name => this.material(name)).then(m => {
      if (this.disposed) { m.dispose(); return; }
      this.model = m;
      this.scene.add(m.root);
      this.kick();
    }, err => console.error('木手模型读不进来', err));
  }

  private material(name: string): THREE.Material {
    let m = this.materials.get(name);
    if (!m) {
      const p = this.o.palette[name] ?? this.o.palette.wood;
      m = new ToonPaletteMaterial(p);
      this.materials.set(name, m);
    }
    return m;
  }

  /** 画布大小变了：重新量 */
  layout(): void {
    const s = this.o.measure();
    if (s.w <= 0 || s.h <= 0) return;
    const pixel = Math.max(1e-3, s.pixel * this.o.config().pixel);
    this.size = { w: s.w, h: s.h, pixel };
    const bw = Math.max(1, Math.round(s.w / pixel)), bh = Math.max(1, Math.round(s.h / pixel));
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.camera.left = 0; this.camera.right = s.w; this.camera.top = 0; this.camera.bottom = -s.h;
    this.camera.updateProjectionMatrix();
    // 给画布设尺寸会把它清空（到下一帧重画之前是空白的）：尺寸没变就不动它，变了就马上重画一帧
    if (buf.x !== bw || buf.y !== bh) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(bw, bh, false);
      this.redraw(performance.now());
    }
    this.kick();
  }

  /** 立刻按现在的状态画一帧（不推进姿势和挪动） */
  private redraw(now: number): void {
    const st = this.state, m = this.model;
    if (!st || !m || st.hidden) return;
    const cfg = this.o.config();
    this.place(st, cfg, now);
    this.draw(cfg);
  }

  /** 手要去哪、什么样；null = 收走 */
  set(st: HandViewState | null): void {
    if (st) {
      const to: Placed = { x: st.at.x, y: st.at.y, angle: handOrientation(st.from, st.tilt).angle };
      if (this.state && st.ms > 0) this.tween = { from: { ...this.shown }, to, start: performance.now(), ms: st.ms };
      else { this.shown = to; this.tween = null; }
    }
    this.state = st;
    this.kick();
  }

  private kick(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const st = this.state, m = this.model;
    if (!st) { this.renderer.clear(); return; }   // 收走了：画布清空，不再画
    this.raf = requestAnimationFrame(this.frame);
    if (!m) return;
    const cfg = this.o.config();
    this.move(now);
    m.setPose(st.pose, cfg.poseMs / 1000);
    m.update(dt);
    if (st.hidden) { this.renderer.clear(); return; }
    this.place(st, cfg, now);
    this.draw(cfg);
  };

  /** 挪动：按缓动从起点走到目标 */
  private move(now: number): void {
    const t = this.tween;
    if (!t) return;
    const k = easeMove(Math.min(1, (now - t.start) / t.ms));
    this.shown = { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k, angle: lerpAngle(t.from.angle, t.to.angle, k) };
    if (k >= 1) this.tween = null;
  }

  /** 把手摆到位：对准点落在 shown，前臂伸到画面外 */
  private place(st: HandViewState, cfg: GmHandConfig, now: number): void {
    const m = this.model!, { w, h } = this.size;
    const s = (st.length ?? cfg.length * h) / m.length;   // 页面像素 / 模型单位
    const o = handOrientation(st.from, st.tilt);
    o.angle = this.shown.angle;
    const view = cfg.view[st.pose];
    m.body.rotation.x = THREE.MathUtils.degToRad(view.roll);
    m.body.scale.y = view.flip ? -1 : 1;
    m.root.scale.set(o.mirror ? -s : s, s, s);
    m.root.rotation.z = -THREE.MathUtils.degToRad(o.angle);   // 页面 y 朝下，顺时针为正；这里 y 朝上
    m.root.position.set(0, 0, 0);
    m.root.updateMatrixWorld(true);
    const a = m.root.localToWorld(m.anchor(st.anchor, this.va));   // root 在原点：对准点相对 root 原点的位移（页面像素，y 朝上）
    const j = st.tremble ? TREMBLE[Math.floor(now / TREMBLE_STEP_MS) % TREMBLE.length] : TREMBLE[0];
    m.root.position.set(this.shown.x + j.x - a.x, -(this.shown.y + j.y) - a.y, 0);
    m.root.updateMatrixWorld(true);
    // 前臂：从靠护腕那头沿手臂方向（手本地的 -x）一直伸到画面外
    const origin = m.root.localToWorld(m.armOrigin(this.vb));
    const reach = armReach({ x: origin.x, y: -origin.y }, toPage({ x: -1, y: 0 }, o), { w, h }, cfg.armMargin);
    m.setArm(reach / s);
    this.placeHeld(st.held, m.heldDepth());
  }

  /** 拎着的东西：放在指尖前面一点的深度上（手从后面捏着它），贴图坐标按这一帧裁 */
  private placeHeld(held: HeldSprite | null, depth: number): void {
    const tex = held && this.texture(held.url);
    const img = tex?.image as { width?: number; height?: number } | undefined;
    this.held.visible = !!(held && tex && img?.width && img?.height);
    if (!held || !tex || !img?.width || !img?.height) return;
    (this.held.material as THREE.ShaderMaterial).uniforms.map.value = tex;
    const f = held.frame, W = img.width, H = img.height;
    let u0 = f.x / W, u1 = (f.x + f.w) / W;
    if (held.flipX) [u0, u1] = [u1, u0];
    const v0 = f.y / H, v1 = (f.y + f.h) / H;   // 贴图不翻转：v = 0 是图的第一行（顶上）
    const uv = this.held.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v0); uv.setXY(1, u1, v0); uv.setXY(2, u0, v1); uv.setXY(3, u1, v1);
    uv.needsUpdate = true;
    this.held.position.set(held.at.x, -held.at.y, depth);
    this.held.scale.set(held.w, held.h, 1);
  }

  private texture(url: string): THREE.Texture {
    let t = this.textures.get(url);
    if (!t) {
      t = new THREE.TextureLoader().load(url, () => this.kick());
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;   // 原样采样，不做色彩空间转换：画出来的就是图里的像素
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      this.textures.set(url, t);
    }
    return t;
  }

  private draw(cfg: GmHandConfig): void {
    const r = this.renderer, m = this.model!, sh = cfg.shadow;
    for (const mat of this.materials.values()) mat.setLight({ dir: cfg.light, ambient: cfg.ambient, aoPower: cfg.aoPower });
    r.clear();
    if (sh.opacity > 0) {
      const heldShown = this.held.visible;
      this.held.visible = false;   // 影子只有手的：拎着的贴图是一整块方的，剪影会是一个方块
      this.shadow.uniforms.opacity.value = sh.opacity;
      m.root.position.x += sh.x; m.root.position.y -= sh.y;
      this.scene.overrideMaterial = this.shadow;
      r.render(this.scene, this.camera);
      this.scene.overrideMaterial = null;
      m.root.position.x -= sh.x; m.root.position.y += sh.y;
      this.held.visible = heldShown;
      r.clearDepth();
    }
    r.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.model?.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.held.geometry.dispose();
    (this.held.material as THREE.ShaderMaterial).dispose();
    this.shadow.dispose();
    this.renderer.dispose();
  }
}
