// ===== 舞台上的那块屏幕：游戏画布当实时贴图，贴在一块平面上 =====
// 舞台的坐标：原点在舞台中心，单位是页面像素，y 朝上，相机在 +z 看过来。
// 平面放平（不倾斜）时和页面上的游戏画布重合，换上去看不出来。
import * as THREE from 'three';
import type { ScreenSource } from '@/protocol';

/** 页面上的一块矩形（相对舞台左上角，像素） */
export interface StageRect { x: number; y: number; w: number; h: number }

export class ScreenPlane {
  /** 底边中点：倾斜绕它转 */
  private readonly pivot = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 屏幕本地坐标：左上角是原点，单位是页面像素，x 朝右、y 朝下、z 朝屏幕外。跟着屏幕一起倾斜 */
  private readonly local = new THREE.Group();
  private w = 0;
  private h = 0;
  private texture: THREE.CanvasTexture | null = null;
  private texW = 0;
  private texH = 0;

  constructor(scene: THREE.Scene, private readonly source: ScreenSource) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    this.local.scale.set(1, -1, 1);
    this.pivot.add(this.mesh, this.local);
    scene.add(this.pivot);
  }

  /** 摆到游戏画布在页面上的位置。stageW / stageH 是舞台的大小 */
  place(rect: StageRect, stageW: number, stageH: number): void {
    this.pivot.position.set(rect.x + rect.w / 2 - stageW / 2, stageH / 2 - (rect.y + rect.h), 0);
    this.mesh.scale.set(rect.w, rect.h, 1);
    this.mesh.position.set(0, rect.h / 2, 0);
    this.local.position.set(-rect.w / 2, rect.h, 0);
    this.w = rect.w; this.h = rect.h;
  }

  /** 屏幕底边中点在舞台里的位置（像素） */
  get base(): { x: number; y: number } { return { x: this.pivot.position.x, y: this.pivot.position.y }; }

  /** 屏幕在页面上的大小（像素） */
  get size(): { w: number; h: number } { return { w: this.w, h: this.h }; }

  /** 这一帧的游戏画面（画布换尺寸时会换一张，每帧现取） */
  get map(): THREE.Texture | null { return this.texture; }

  /** 往屏幕上挂东西：用屏幕本地坐标（左上角原点、页面像素、y 朝下） */
  attach(object: THREE.Object3D): void { this.local.add(object); }

  /** 平放的画面画多实：1 = 照常，0 = 不画（换成别的东西了），中间 = 淡入 */
  setFlat(opacity: number): void {
    const m = this.mesh.material, fading = opacity < 1;
    this.mesh.visible = opacity > 0;
    if (m.transparent !== fading) { m.transparent = fading; m.needsUpdate = true; }
    m.opacity = opacity;
  }

  /** 往后倒多少度（上边往远处去） */
  setTilt(deg: number): void { this.pivot.rotation.x = -THREE.MathUtils.degToRad(deg); }

  /** 绕底边中点左右歪多少度（往右歪为正） */
  setRoll(deg: number): void { this.pivot.rotation.z = -THREE.MathUtils.degToRad(deg); }

  /** 取这一帧的游戏画面。要在 ScreenSource.onFrame 的回调里调（那时才读得到画布） */
  sync(): void {
    const c = this.source.canvas;
    // 画布换了尺寸（换层）：贴图重建
    if (!this.texture || c.width !== this.texW || c.height !== this.texH) {
      this.texture?.dispose();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;   // 放大时按像素画，和游戏画面一样
      t.minFilter = THREE.LinearFilter;    // 倒下去远处缩小了：平滑采样，不闪
      t.generateMipmaps = false;
      this.texture = t; this.texW = c.width; this.texH = c.height;
      this.mesh.material.map = t;
      this.mesh.material.needsUpdate = true;
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.pivot.removeFromParent();
    this.texture?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
