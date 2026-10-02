// ===== 节奏关卡的 3D 那一半：曲子最高潮时主角破屏跳出来，在屏幕外的大道上接着玩 =====
// 和 World3D 一样跑在 3D 舞台上、同一套坐标（原点在屏幕底边中点，单位是格，+z 朝镜头）。
// 谱面里 realm = deep 的那几段归这里：管大道、主角进出场、轮到哪一段、镜头跟到那一段的机位；怎么玩、怎么画在 modes/ 里。
// 轮到 2D 的段落、或者谱面走完了，人就回画面里去。破屏时屏幕往后倒，画面里的四条道顺势接上画面外的大道。
// 时间都听指挥的（rhythm/Conductor）：音符在哪是按「曲子现在第几毫秒」算的，不是一帧帧累加的。
import * as THREE from 'three';
import type { HeroHandoff } from '@/protocol';
import type { RhythmConfig } from '@/type';
import { beatMs, RHYTHM_MODES, sectionAt, type RhythmSession } from '@/rhythm';
import type { StageFxContext, StageFxRun } from '@/stage3d/fx/define';
import { Colors } from '@/game/palette';
import { Hero3D } from '../Hero3D';
import { WorldInput } from '../input';
import { createRhythmMode, guideLines, type ModeContext, type RhythmMode } from './modes/define';
import './modes';

/** 一帧最多按多久算（毫秒） */
const MAX_STEP_MS = 50;
/** 人飞到道上时中途抬多高（格）；道上画几条分隔线 */
const ENTER_ARC = 3, DIVIDERS = RHYTHM_MODES.saber.lanes;

export interface RhythmWorldOptions {
  config(): RhythmConfig;
  session: RhythmSession;
  heroUrl: string;
  /** 回到画面用多久（毫秒） */
  returnMs: number;
  /** 人回到画面上了 */
  onExit(): void;
}

/** in = 从画面飞到道上；play = 曲子在放；back = 飞回画面；handing = 已交还，多留一帧；done = 收场 */
type Phase = 'in' | 'play' | 'back' | 'handing' | 'done';

export class RhythmWorld implements StageFxRun {
  private readonly root = new THREE.Group();
  private readonly hero: Hero3D;
  private readonly input = new WorldInput();
  /** 每个 3D 段落一个玩法实例（下标 = 第几段；2D 的段落没有） */
  private readonly modes = new Map<number, RhythmMode>();
  /** 进场时飞向哪一段的站位 */
  private readonly entry: RhythmMode;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly home: THREE.Vector3;
  private readonly camHome: THREE.Vector3;
  private phase: Phase = 'in';
  private k = 0;
  private section = -1;
  private tilt = 0;
  private readonly from = { hero: new THREE.Vector3(), cam: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly aim = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();

  constructor(private readonly ctx: StageFxContext, handoff: HeroHandoff, private readonly o: RhythmWorldOptions) {
    const size = ctx.screen.size, base = ctx.screen.base, unit = handoff.tile * size.w, cfg = o.config(), { chart, notes } = o.session;
    const w = size.w / unit, h = size.h / unit, heroZ = cfg.heroZ * w;
    this.root.position.set(base.x, base.y, 0);
    this.root.scale.setScalar(unit);

    const hw = handoff.w * w, hh = handoff.h * h;
    this.home = new THREE.Vector3((handoff.x - 0.5) * w, (1 - handoff.y) * h - hh / 2, 0);
    this.hero = new Hero3D(o.heroUrl, hw, hh);
    this.hero.face(handoff.facing);
    this.hero.place(this.home.x, this.home.y, 0, 1);
    this.hero.castShadow(null);
    this.floor(w, heroZ + cfg.tail * w, heroZ);
    this.root.add(this.hero.object);
    ctx.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    const mctx: ModeContext = {
      root: this.root, hero: this.hero, w, h, heroZ, travelMs: cfg.travelBeats * beatMs(chart),
      config: o.config, score: o.session.score,
    };
    chart.sections.forEach((s, i) => { if (RHYTHM_MODES[s.mode].realm === 'deep') this.modes.set(i, createRhythmMode(s.mode, mctx, notes.filter(n => n.section === i))); });
    // 进场飞向接下来第一个 3D 段落的站位
    const now = sectionAt(chart, o.session.conductor.timeMs());
    const next = [...this.modes.keys()].find(i => i >= now) ?? [...this.modes.keys()][0];
    if (next === undefined) throw new Error('这张谱没有 3D 的段落');
    this.entry = this.modes.get(next)!;

    this.camHome = ctx.camera.position.clone();
    this.from.hero.copy(this.home); this.from.cam.copy(this.camHome);
  }

  update(dtMs: number): boolean {
    if (this.phase === 'done') return false;
    if (this.phase === 'handing') { this.phase = 'done'; return false; }
    const cfg = this.o.config(), { conductor, chart } = this.o.session;
    if (this.phase === 'in') {
      this.aimAt(this.entry);
      this.fly(dtMs / cfg.enterMs, this.entry.spot(), this.eye, this.quat, 1, cfg.heroScale, 0, cfg.screenTilt, () => { this.phase = 'play'; });
    } else if (this.phase === 'back') {
      this.fly(dtMs / this.o.returnMs, this.home, this.camHome, this.quat.identity(), cfg.heroScale, 1, this.tilt, 0, () => { this.phase = 'handing'; this.o.onExit(); });
    } else {
      const now = conductor.timeMs(), dt = Math.min(dtMs, MAX_STEP_MS) / 1000;
      // 轮到哪一段了：是 3D 的就玩，轮到 2D 的段落、或者谱面走完了，回画面里去
      const section = sectionAt(chart, now), mode = this.modes.get(section);
      if (!mode || conductor.finished) { this.leave(); return true; }
      if (section !== this.section) {
        this.modes.get(this.section)?.setActive(false); mode.setActive(true);
        this.section = section;
      }
      mode.update(now, dt, this.input.read());
      // 镜头跟到这一段的机位
      this.aimAt(mode);
      const k = cfg.cameraMs > 0 ? 1 - Math.exp(-dtMs / cfg.cameraMs) : 1, cam = this.ctx.camera;
      cam.position.lerp(this.eye, k); cam.quaternion.slerp(this.quat, k);
    }
    const now = this.o.session.conductor.timeMs();
    this.modes.forEach(m => m.draw(now));
    return true;
  }

  /** 请它收场（中途退出） */
  end(): void { if (this.phase === 'in' || this.phase === 'play') this.leave(); }

  dispose(): void {
    this.input.dispose();
    this.modes.forEach(m => m.dispose());
    this.root.removeFromParent();
    this.hero.dispose();
    this.disposables.forEach(d => d.dispose());
    this.ctx.screen.setTilt(0);
    this.ctx.resetCamera();
  }

  private leave(): void {
    this.phase = 'back'; this.k = 0;
    this.modes.get(this.section)?.setActive(false);
    this.hero.fade(1);
    this.hero.castShadow(null);
    this.from.hero.copy(this.hero.position);
    this.from.cam.copy(this.ctx.camera.position); this.from.quat.copy(this.ctx.camera.quaternion);
  }

  /** 这种玩法的机位换成舞台坐标：写进 this.eye / this.quat */
  private aimAt(mode: RhythmMode): void {
    const c = mode.camera();
    this.root.localToWorld(this.eye.copy(c.eye)); this.root.localToWorld(this.look.copy(c.look));
    this.quat.setFromRotationMatrix(this.aim.lookAt(this.eye, this.look, this.ctx.camera.up));
  }

  /** 人和镜头一起从一处飞到另一处（进场、回画面）：人走一条弧线，大小从 s0 变到 s1，屏幕从倒 t0 度变到 t1 度 */
  private fly(step: number, to: THREE.Vector3, cam: THREE.Vector3, quat: THREE.Quaternion, s0: number, s1: number, t0: number, t1: number, then: () => void): void {
    this.k = Math.min(1, this.k + (Number.isFinite(step) ? step : 1));
    const e = this.k < 0.5 ? 2 * this.k * this.k : 1 - (-2 * this.k + 2) ** 2 / 2, f = this.from;
    this.hero.place(
      f.hero.x + (to.x - f.hero.x) * e, f.hero.y + (to.y - f.hero.y) * e + Math.sin(Math.PI * e) * ENTER_ARC, f.hero.z + (to.z - f.hero.z) * e,
      s0 + (s1 - s0) * e,
    );
    this.tilt = t0 + (t1 - t0) * e;
    this.ctx.screen.setTilt(this.tilt);
    this.ctx.camera.position.lerpVectors(f.cam, cam, e);
    this.ctx.camera.quaternion.slerpQuaternions(f.quat, quat, e);
    if (this.k >= 1) { this.k = 0; then(); }
  }

  /** 大道：深色的一块（和屏幕一样宽，从屏幕底边铺到主角身后），道与道之间的线，主角那一排一条亮线 */
  private floor(w: number, len: number, heroZ: number): void {
    const plane = new THREE.PlaneGeometry(w, len), fill = new THREE.MeshBasicMaterial({ color: Colors.deep });
    const ground = new THREE.Mesh(plane, fill);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, len / 2);
    this.root.add(ground);
    const lift = 0.02, dividers: number[] = [];
    for (let i = 0; i <= DIVIDERS; i++) { const x = i * w / DIVIDERS - w / 2; dividers.push(x, lift, 0, x, lift, len); }
    this.disposables.push(plane, fill, guideLines(this.root, dividers, Colors.paper), guideLines(this.root, [-w / 2, lift, heroZ, w / 2, lift, heroZ], Colors.gold));
  }
}
