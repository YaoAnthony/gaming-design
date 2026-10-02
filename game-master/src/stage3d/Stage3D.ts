// ===== 3D 舞台：最外层的 three.js 画布，游戏画面是舞台上的一块屏幕（ScreenPlane）=====
// 平时不画：玩家看到的就是原样的游戏画布。有特效在放时才接手：游戏画布藏起来照常画，每帧当贴图贴到屏幕上，
// 由舞台代为显示；特效都放完了再还回去。
// 舞台没有自己的帧循环：跟着游戏画完一帧的通知画（那时才读得到游戏画布）。
import * as THREE from 'three';
import type { ScreenSource, StageFxId } from '@/protocol';
import type { Stage3DConfig } from '@/type';
import { ScreenPlane, type StageRect } from './ScreenPlane';
import { getStageFx, type StageFxContext, type StageFxRun } from './fx/define';
import './fx';

/** 设备像素比最多按多少算（再高只是白费显卡） */
const MAX_DPR = 2;
/** 近 / 远裁剪面：相机到屏幕距离的多少倍 */
const NEAR = 0.1, FAR = 10;

export interface Stage3DOptions {
  canvas: HTMLCanvasElement;
  source: ScreenSource;
  config(): Stage3DConfig;
  /** 舞台的大小、游戏画布在舞台里的位置（页面像素）：每次要用时现量 */
  measure(): { w: number; h: number; screen: StageRect };
  /** 一个特效放完、撤掉了 */
  onFxDone(id: StageFxId): void;
}

export class Stage3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly screen: ScreenPlane;
  private readonly ctx: StageFxContext;
  private readonly running = new Map<StageFxId, StageFxRun>();
  private unsubscribe: (() => void) | null = null;
  /** 舞台已经接手显示（游戏画布藏起来了） */
  private showing = false;
  private last = 0;

  /** 没有 WebGL 时抛错 */
  constructor(private readonly o: Stage3DOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.screen = new ScreenPlane(this.scene, o.source);
    this.ctx = { screen: this.screen, scene: this.scene, camera: this.camera, config: o.config, resetCamera: () => this.layout() };
    o.canvas.style.visibility = 'hidden';
  }

  /** 放一个注册过的特效；已经在放、或没有这个特效，返回 false */
  start(id: StageFxId): boolean {
    const def = getStageFx(id);
    return !!def && this.add(id, ctx => def.start(ctx)) !== null;
  }

  /** 放一个由调用方带着走的特效（比如攥纸团：时间线在外面，每帧把状态交进来）；已经在放返回 null */
  add<R extends StageFxRun>(id: StageFxId, make: (ctx: StageFxContext) => R): R | null {
    if (this.running.has(id)) return null;
    if (!this.unsubscribe) this.layout();
    const run = make(this.ctx);
    this.running.set(id, run);
    if (!this.unsubscribe) {
      this.last = performance.now();
      this.unsubscribe = this.o.source.onFrame(this.frame);
    }
    return run;
  }

  /** 立刻撤掉 add 进来的那一次特效（带着它走的一方自己没了）；已经放完、或早换成另一次了就不管 */
  remove(id: StageFxId, run: StageFxRun): void {
    if (this.running.get(id) !== run) return;
    this.finish(id, run);
    if (this.running.size === 0) this.release();
  }

  private finish(id: StageFxId, run: StageFxRun): void {
    run.dispose?.();
    this.running.delete(id);
    this.o.onFxDone(id);
  }

  /** 请一个特效收场 */
  end(id: StageFxId): void { this.running.get(id)?.end(); }

  isRunning(id: StageFxId): boolean { return this.running.has(id); }

  /** 舞台或游戏画布的大小、位置变了：重新对齐 */
  layout(): void {
    const { w, h, screen } = this.o.measure();
    if (w <= 0 || h <= 0) return;
    this.renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    // 相机退到正好让 z = 0 的平面上一个单位 = 页面上一个像素
    const fov = this.o.config().fov;
    const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    this.camera.fov = fov; this.camera.aspect = w / h;
    this.camera.near = dist * NEAR; this.camera.far = dist * FAR;
    this.camera.position.set(0, 0, dist);
    this.camera.quaternion.identity();
    this.camera.updateProjectionMatrix();
    this.screen.place(screen, w, h);
  }

  private readonly frame = (): void => {
    const now = performance.now(), dt = now - this.last;
    this.last = now;
    for (const [id, run] of this.running) {
      if (!run.update(dt)) this.finish(id, run);
    }
    if (this.running.size === 0) { this.release(); return; }
    this.screen.sync();
    this.renderer.render(this.scene, this.camera);
    // 第一帧画好了才把游戏画布换下去：中间没有空白的一帧
    if (!this.showing) { this.showing = true; this.o.canvas.style.visibility = ''; this.o.source.setVisible(false); }
  };

  /** 特效都放完了：把画面还给游戏画布 */
  private release(): void {
    this.unsubscribe?.(); this.unsubscribe = null;
    if (!this.showing) return;
    this.showing = false;
    this.o.source.setVisible(true);
    this.o.canvas.style.visibility = 'hidden';
  }

  destroy(): void {
    for (const run of this.running.values()) run.dispose?.();
    this.running.clear();
    this.release();
    this.screen.dispose();
    this.renderer.dispose();
  }
}
