// ===== 攥纸团：屏幕换成一张纸，按 CrumpleMesh 算好的三角形画出来 =====
// 时间线在外面（ui/crumple/CrumpleOverlay：手、声音、各段时长），每帧把纸的状态交进来（set），这里只管画。
// 纸挂在屏幕上（屏幕本地坐标），没捏的时候和平放的画面一模一样，换上去看不出来；屏幕倒着，纸也跟着倒。
// 人在 3D 世界里时（summonReaper）攥它的披风骷髅也站在屏幕旁边，手的动作同样由时间线交进来。
// 开深度测试（纸叠起来时近的挡住远的）；纸翻过去的面、褶缝里墨裂开的地方画成白纸（隐约透出一点画面）。
import * as THREE from 'three';
import { Colors } from '@/game/palette';
import type { StageFxContext, StageFxRun } from '../define';
import { CrumpleMesh, VERTEX_FLOATS, type CrumpleState, type Vec2 } from './crumpleMesh';
import { Reaper, type ReaperPose } from './Reaper';

/** 纸背面隐约透出多少正面的画面 */
const SHOW_THROUGH = 0.12;

const VS = `
attribute vec2 aShade;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vShade = aShade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 明暗和白纸的混合都在显示用的色彩（sRGB）里算，平放时和游戏画面逐像素一样
const FS = `
uniform sampler2D map;
uniform vec3 uPaper;
uniform float uShowThrough;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vec3 front = sRGBTransferOETF(texture2D(map, vUv)).rgb;
  vec3 back = mix(uPaper, front, uShowThrough);
  gl_FragColor = vec4(mix(back, front, vShade.y) * vShade.x, 1.0);
}`;

/** live = 还没换成纸，屏幕照常；paper = 纸；empty = 纸团扔掉了，什么都不画；fade = 新画面淡入；done = 放完 */
type Mode = 'live' | 'paper' | 'empty' | 'fade' | 'done';

export class CrumplePaper implements StageFxRun {
  private readonly geometry: CrumpleMesh;
  private readonly verts: THREE.InterleavedBuffer;
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private mode: Mode = 'live';
  private state: CrumpleState | null = null;
  private fade = { ms: 0, k: 0 };
  private reaper: Reaper | null = null;

  /** @param grab 攥住的位置（画面上的比例坐标 0..1） */
  constructor(private readonly ctx: StageFxContext, grab: Vec2) {
    const { w, h } = ctx.screen.size;
    this.geometry = new CrumpleMesh({ x: 0, y: 0, w, h, grab: { x: grab.x * w, y: grab.y * h } });
    this.verts = new THREE.InterleavedBuffer(new Float32Array(this.geometry.vertexCount * VERTEX_FLOATS), VERTEX_FLOATS);
    this.verts.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(this.verts, 3, 0));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(this.verts, 2, 3));
    g.setAttribute('aShade', new THREE.InterleavedBufferAttribute(this.verts, 2, 5));
    const material = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,
      uniforms: {
        map: { value: null },
        uPaper: { value: new THREE.Color().setHex(Colors.paperWarm, THREE.LinearSRGBColorSpace) },
        uShowThrough: { value: SHOW_THROUGH },
      },
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;   // 顶点每帧在变，不算包围盒
    this.mesh.visible = false;
    ctx.screen.attach(this.mesh);
  }

  /** 纸团半径（页面像素，没捏紧时） */
  get ballRadius(): number { return this.geometry.ballRadius; }

  /**
   * 把披风骷髅叫出来（人在 3D 世界里才叫）。handScale = 手那张贴图的一个像素放大成多少页面像素。
   * 返回没伸手时拳心在哪（屏幕本地坐标）：手从那伸出去，松手后收回那
   */
  summonReaper(handScale: number): Vec2 {
    this.reaper ??= new Reaper(this.ctx.screen, handScale, this.ballRadius);
    return this.reaper.rest;
  }

  /** 骷髅和它的手这一帧的样子 */
  setReaper(pose: ReaperPose): void { this.reaper?.set(pose); }

  /** 屏幕换成纸（游戏已经冻住）：之后按 set 交进来的状态画 */
  show(): void { if (this.mode === 'live') this.mode = 'paper'; }

  /** 纸现在的样子（hand 用屏幕本地坐标）；offset = 整张纸挪多少像素（画面震动） */
  set(state: CrumpleState, offset: Vec2): void {
    this.state = state;
    this.mesh.position.set(offset.x, offset.y, 0);
  }

  /** 纸团扔出画面了 */
  clear(): void { if (this.mode === 'paper') this.mode = 'empty'; }

  /** 新画面淡入 ms 毫秒，然后放完 */
  finish(ms: number): void { this.mode = 'fade'; this.fade = { ms, k: 0 }; }

  update(dtMs: number): boolean {
    const { screen } = this.ctx;
    if (this.mode === 'done') return false;
    if (this.mode === 'fade') {
      this.fade.k = this.fade.ms > 0 ? Math.min(1, this.fade.k + dtMs / this.fade.ms) : 1;
      if (this.fade.k >= 1) return false;
    }
    this.mesh.visible = this.mode === 'paper';
    screen.setFlat(this.mode === 'live' ? 1 : this.mode === 'fade' ? this.fade.k : 0);
    if (this.mode === 'paper' && this.state) {
      this.geometry.update(this.state, this.verts.array as Float32Array);
      this.verts.needsUpdate = true;
      this.mesh.material.uniforms.map.value = screen.map;
    }
    return true;
  }

  end(): void { this.mode = 'done'; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.reaper?.dispose();
    this.ctx.screen.setFlat(1);
  }
}
