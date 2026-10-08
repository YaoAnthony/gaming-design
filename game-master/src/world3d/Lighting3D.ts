// ===== 3D 世界的灯光：照着《小小梦魇》那种调子 =====
// 一盏吊灯打一小圈暖光（聚光灯挂在 LevelView 摆的吊灯灯泡上，投影），其余全沉进冷蓝的黑里（带颜色的环境光 + 雾）；
// 后面来一道冷光勾出 Boss 的轮廓；光柱里飘着灰尘；画面四角压暗（贴在镜头前的一层渐变）。
// 参数全在 config.world3d.lighting。单位：格（加进 World3D 的 root 里，root 已经按格缩放），灯的投影范围和雾要换成世界单位。
import * as THREE from 'three';
import type { LightingConfig } from '@/type';

const VIGNETTE_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const VIGNETTE_FRAG = `varying vec2 vUv; uniform float strength;
void main() { float d = length((vUv - 0.5) * vec2(2.0, 1.7)); gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(0.4, 1.3, d) * strength); }`;

export class Lighting3D {
  /** 灯和灰尘（放进关卡的 root 里） */
  readonly object = new THREE.Group();
  private readonly lamp: THREE.SpotLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly dustBox: { x: number; y0: number; y1: number; z: number; r: number };
  private readonly vignette: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private glow: THREE.Sprite | null = null;
  private readonly fogBefore: THREE.Scene['fog'];
  private t = 0;

  /** @param unit 一格是多少世界单位 */
  constructor(private readonly cfg: LightingConfig, unit: number, private readonly scene: THREE.Scene) {
    const L = cfg.lamp;
    this.lamp = new THREE.SpotLight(new THREE.Color(L.color), L.intensity, 0, THREE.MathUtils.degToRad(L.angle), L.penumbra, 0);
    this.lamp.position.set(L.at[0], L.at[1], L.at[2]);
    this.lamp.target.position.set(L.look[0], L.look[1], L.look[2]);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(2048, 2048);
    this.lamp.shadow.camera.near = 0.5 * unit;
    this.lamp.shadow.camera.far = 160 * unit;
    this.lamp.shadow.normalBias = 0.04 * unit;
    this.lamp.shadow.bias = -0.0002;
    this.ambient = new THREE.AmbientLight(new THREE.Color(cfg.ambient.color), cfg.ambient.intensity);
    this.rim = new THREE.DirectionalLight(new THREE.Color(cfg.rim.color), cfg.rim.intensity);
    this.rim.position.set(cfg.rim.from[0], cfg.rim.from[1], cfg.rim.from[2]);
    this.rim.target.position.set(L.look[0], L.look[1] + 4, L.look[2]);
    this.object.add(this.lamp, this.lamp.target, this.ambient, this.rim, this.rim.target);
    if (L.glow > 0 && typeof document !== 'undefined') {
      // 灯泡周围一团暖光晕：一张画出来的径向渐变贴在面向镜头的方片上
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g2 = cv.getContext('2d')!, grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,236,200,0.9)'); grad.addColorStop(0.25, 'rgba(255,220,160,0.45)'); grad.addColorStop(1, 'rgba(255,200,120,0)');
      g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cv);
      this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.glow.position.set(L.at[0], L.at[1], L.at[2]);
      this.glow.scale.setScalar(L.glow);
      this.object.add(this.glow);
    }

    // 灰尘：灯下面一个方柱里撒点，慢慢往下飘、左右晃，掉到底再回到灯那
    const D = cfg.dust;
    this.dustBox = { x: L.look[0], y0: L.look[1], y1: L.at[1], z: L.look[2], r: D.spread };
    const pos = new Float32Array(D.count * 3), seed = new Float32Array(D.count);
    for (let i = 0; i < D.count; i++) {
      pos[i * 3] = this.dustBox.x + (Math.random() * 2 - 1) * D.spread;
      pos[i * 3 + 1] = this.dustBox.y0 + Math.random() * (this.dustBox.y1 - this.dustBox.y0);
      pos[i * 3 + 2] = this.dustBox.z + (Math.random() * 2 - 1) * D.spread;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(D.color), size: D.size * unit, transparent: true, opacity: D.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.object.add(this.dust);

    // 暗角：一块贴在裁剪空间上的方片，不受镜头影响
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: VIGNETTE_VERT, fragmentShader: VIGNETTE_FRAG, uniforms: { strength: { value: cfg.vignette } },
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.vignette.frustumCulled = false;
    this.vignette.renderOrder = 1000;
    scene.add(this.vignette);

    this.fogBefore = scene.fog;
    scene.fog = new THREE.Fog(new THREE.Color(cfg.fog.color), cfg.fog.near * unit, cfg.fog.far * unit);
  }

  update(dtSec: number): void {
    this.t += dtSec;
    const D = this.cfg.dust, b = this.dustBox;
    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute, s = this.dust.geometry.getAttribute('seed') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = s.getX(i);
      let y = p.getY(i) - D.fall * (0.6 + 0.4 * Math.sin(k)) * dtSec;
      if (y < b.y0) y = b.y1;
      p.setXYZ(i, p.getX(i) + Math.sin(this.t * 0.7 + k) * 0.25 * dtSec, y, p.getZ(i) + Math.cos(this.t * 0.5 + k * 1.3) * 0.25 * dtSec);
    }
    p.needsUpdate = true;
  }

  dispose(): void {
    this.scene.fog = this.fogBefore;
    this.vignette.removeFromParent();
    this.vignette.geometry.dispose(); this.vignette.material.dispose();
    this.dust.geometry.dispose(); this.dust.material.dispose();
    if (this.glow) { this.glow.material.map?.dispose(); this.glow.material.dispose(); }
    this.lamp.dispose(); this.rim.dispose(); this.ambient.dispose();
    this.object.removeFromParent();
  }
}
