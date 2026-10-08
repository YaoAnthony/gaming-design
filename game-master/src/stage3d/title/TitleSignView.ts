import * as THREE from 'three';

export interface TitleSignLayout {
  w: number; h: number;
  title: { x: number; y: number; w: number; h: number };
}

/** Transparent pixel-art sign, suspended from two straight, flat brown straps. */
export class TitleSignView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  private readonly sign = new THREE.Mesh(this.geometry, this.material);
  private readonly straps: THREE.Group[] = [];
  private readonly strapMaterials: THREE.MeshBasicMaterial[] = [];
  private texture: THREE.Texture | null = null;
  private readonly ready: Promise<void>;
  private size: TitleSignLayout = { w: 1, h: 1, title: { x: 0, y: 0, w: 1, h: 1 } };
  private phase: 'hidden' | 'enter' | 'hang' | 'drop' = 'hidden';
  private elapsed = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private complete: (() => void) | null = null;
  private caught = false;

  constructor(canvas: HTMLCanvasElement, url: string, private readonly measure: () => TitleSignLayout, private readonly onCatch: () => void = () => {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.position.z = 10;
    this.sign.position.z = 1;
    this.scene.add(this.sign);
    for (let i = 0; i < 2; i++) {
      const strap = new THREE.Group();
      for (const [color, x, y, w, h, z] of [
        [0x30271f, 0, 0, 1, 1, 0], [0x866247, 0, 0, 0.76, 1, 0.01],
        [0xad8260, -0.29, 0, 0.10, 1, 0.02], [0x5c4535, 0.27, 0, 0.09, 1, 0.02],
        [0xc29b60, -0.08, 0.12, 0.17, 0.018, 0.03], [0xb18b56, 0.06, -0.28, 0.14, 0.018, 0.03],
      ]) {
        const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        this.strapMaterials.push(material);
        const piece = new THREE.Mesh(this.geometry, material);
        piece.position.set(x, y, z); piece.scale.set(w, h, 1);
        strap.add(piece);
      }
      this.straps.push(strap); this.scene.add(strap);
    }
    this.layout();
    this.ready = new THREE.TextureLoader().loadAsync(url).then(texture => {
      if (this.disposed) { texture.dispose(); return; }
      this.texture = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      this.material.map = texture; this.material.needsUpdate = true;
    });
  }

  layout(): void {
    const size = this.measure();
    if (size.w <= 0 || size.h <= 0 || size.title.w <= 0) return;
    // 给画布设尺寸（哪怕没变）会把它清空，到下一帧重画之前就是一帧空白（标题会闪一下）：尺寸没变就不动它，变了就马上重画
    const resized = size.w !== this.size.w || size.h !== this.size.h;
    this.size = size;
    if (resized) {
      this.renderer.setSize(size.w, size.h, false);
      this.camera.right = size.w; this.camera.bottom = -size.h;
      this.camera.updateProjectionMatrix();
    }
    if (this.phase === 'hidden') return;
    if (resized) { cancelAnimationFrame(this.raf); this.raf = 0; this.frame(performance.now()); }
    // Reduced motion does not run an idle loop, so redraw on resize.
    else if (!this.raf && this.phase === 'hang') this.raf = requestAnimationFrame(this.frame);
  }

  async enter(): Promise<void> {
    await this.ready;
    if (!this.disposed) await this.begin('enter');
  }

  drop(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.begin('drop');
  }

  private begin(phase: 'enter' | 'drop'): Promise<void> {
    this.complete?.();
    this.phase = phase; this.elapsed = 0; this.caught = false; this.last = performance.now();
    const promise = new Promise<void>(resolve => { this.complete = resolve; });
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    return promise;
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = document.hidden ? 0 : Math.min((now - this.last) / 1000, 0.05);
    this.last = now; this.elapsed += dt;
    const { w, h, title } = this.size, t = this.elapsed;
    let dy = 0, dx = 0, angle = 0;
    if (this.phase === 'enter') {
      if (!this.caught && t >= (this.reducedMotion ? 0.05 : 0.62)) { this.caught = true; this.onCatch(); }
      if (!this.reducedMotion) {
        const p = Math.min(t / 0.62, 1);
        dy = -h * 0.8 * (1 - p * p);
        if (t > 0.62) dy = Math.sin((t - 0.62) * 21) * h * 0.013 * Math.exp(-(t - 0.62) * 10);
      }
      if (t >= (this.reducedMotion ? 0.05 : 0.98)) {
        this.phase = 'hang'; this.elapsed = 0; this.complete?.(); this.complete = null;
      }
    } else if (this.phase === 'hang' && !this.reducedMotion) {
      dx = Math.sin(t * 1.5) * h * 0.0015; angle = Math.sin(t * 1.5) * 0.003;
    } else if (this.phase === 'drop') {
      dy = h * (0.1 * t + 2.8 * t * t); dx = w * 0.018 * t; angle = -0.15 * t * t;
      if (this.reducedMotion) this.material.opacity = Math.max(0, 1 - t / 0.15);
      if (t >= (this.reducedMotion ? 0.15 : 0.9)) {
        this.phase = 'hidden'; this.complete?.(); this.complete = null;
      }
    }
    this.sign.visible = this.phase !== 'hidden';
    this.sign.position.set(title.x + title.w / 2 + dx, -(title.y + title.h / 2 + dy), 1);
    this.sign.scale.set(title.w, title.h, 1); this.sign.rotation.z = angle;
    // Mount centers in the transparent 1672 × 941 sprite.
    const pinY = title.h * (0.5 - 168 / 941), pinXs = [360 / 1672 - 0.5, 1309 / 1672 - 0.5];
    this.straps.forEach((strap, i) => {
      strap.visible = this.phase !== 'hidden';
      const pinX = pinXs[i] * title.w;
      let endX = this.sign.position.x + pinX * Math.cos(angle) - pinY * Math.sin(angle);
      let endY = this.sign.position.y + pinX * Math.sin(angle) + pinY * Math.cos(angle);
      const startX = title.x + title.w / 2 + pinX;
      let startY = 12;
      if (this.phase === 'enter') startY -= dy;
      if (this.phase === 'drop') {
        // Released straps retract independently of the falling sign.
        endX = startX;
        endY = -(title.y + title.h * 168 / 941) + h * Math.min(t / 0.32, 1);
        startY += h * Math.min(t / 0.32, 1);
      }
      const vx = endX - startX, vy = endY - startY;
      strap.position.set((startX + endX) / 2, (startY + endY) / 2, 0);
      strap.rotation.z = Math.atan2(vx, -vy);
      strap.scale.set(Math.max(4, title.w * 0.018), Math.hypot(vx, vy), 1);
    });
    this.renderer.render(this.scene, this.camera);
    if (this.phase !== 'hidden' && !(this.phase === 'hang' && this.reducedMotion)) this.raf = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.raf);
    this.complete?.(); this.complete = null;
    this.texture?.dispose(); this.geometry.dispose(); this.material.dispose();
    this.strapMaterials.forEach(material => material.dispose());
    this.renderer.dispose();
  }
}
