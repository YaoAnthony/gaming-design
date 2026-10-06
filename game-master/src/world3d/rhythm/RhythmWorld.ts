// ===== 节奏关卡的 3D 那一半：曲子最高潮时主角破屏跳出来，在屏幕外的大道上接着玩 =====
// 和 World3D 一样跑在 3D 舞台上、同一套坐标（原点在屏幕底边中点，单位是格，+z 朝镜头）。
// 谱面里 realm = deep 的那几段归这里：管大道、主角进出场、轮到哪一段、镜头跟到那一段的机位；怎么玩、怎么画在 modes/ 里。
// 轮到 2D 的段落、或者谱面走完了，人就回画面里去。
// 破屏的演出：屏幕往后一倒（倒过头再弹回来一点），大道从屏幕底边一路铺到镜头前，人高高地飞出来；落地那一下地上荡开一圈、镜头往下一沉。
// 时间都听指挥的（rhythm/Conductor）：音符在哪是按「曲子现在第几毫秒」算的，不是一帧帧累加的。
import * as THREE from 'three';
import type { HeroHandoff } from '@/protocol';
import type { RhythmConfig } from '@/type';
import { beatMs, RHYTHM_MODES, sectionAt, travelMsOf, type RhythmSession } from '@/rhythm';
import type { StageFxContext, StageFxRun } from '@/stage3d/fx/define';
import { Colors } from '@/game/palette';
import { Hero3D } from '../Hero3D';
import { WorldInput } from '../input';
import { createRhythmMode, guideLines, type ModeContext, type RhythmMode } from './modes/define';
import { BossHands } from './BossHands';
import './modes';

/** 一帧最多按多久算（毫秒） */
const MAX_STEP_MS = 50;
/** 人飞到道上时中途抬多高（格）；道上画几条分隔线 */
const ENTER_ARC = 6, DIVIDERS = RHYTHM_MODES.saber.lanes;
/**
 * 破屏的演出：屏幕倒下去时倒过头多少（回弹的劲，0 = 不过头）；大道在进场的前几成时间里铺完；
 * 落地：地上那一圈荡多久（毫秒）、荡到多大（格）、镜头往下沉多少（格）
 */
const BREAK = { overshoot: 1.6, unroll: 0.7, ringMs: 450, ringSize: 9, jolt: 1.6 };
/** 镜头自己的坐标里朝前的轴（歪头绕它转） */
const FORWARD = new THREE.Vector3(0, 0, -1);
/** 倒过头再弹回来（k 从 0 到 1） */
const easeOutBack = (k: number, s: number) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;


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
  /** 大道（地面和线）：进场时从屏幕底边往镜头这边铺开 */
  private readonly road = new THREE.Group();
  /** Game Master 伸到画面外面来的两只手：3D 里的音符是它们放出来的 */
  private readonly hands: BossHands;
  /** 下一个还没出发的音符；每个 3D 段落的音符提前多久出发（毫秒，下标 = 第几段） */
  private nextNote = 0;
  private readonly travel = new Map<number, number>();
  /** 落地时地上荡开的那一圈 */
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private ringLeft = 0;
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
  private readonly rollQuat = new THREE.Quaternion();
  /** 第 lane 条道（一共 lanes 条）的中线在哪（x） */
  private readonly laneOf: (lane: number, lanes: number) => number;

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
    this.road.scale.z = 0.001;
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 40), ringMat = new THREE.MeshBasicMaterial({ color: Colors.gold, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.disposables.push(ringGeo, ringMat);
    this.root.add(this.road, this.ring, this.hero.object);
    ctx.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    const mctx: Omit<ModeContext, 'travelMs'> = {
      root: this.root, hero: this.hero, w, h, heroZ, config: o.config, score: o.session.score,
      hurt: () => o.session.hurt(), bossHit: () => o.session.bossHit(), boom: () => o.session.boom(),
      // Game Master 在画面上的位置换成这里的坐标：屏幕绕底边往后倒了 tilt 度，他离底边多高就沿着斜面上去多远
      bossAt: () => {
        const up = (1 - o.session.boss.y) * h, a = THREE.MathUtils.degToRad(this.tilt);
        return new THREE.Vector3((o.session.boss.x - 0.5) * w, up * Math.cos(a), -up * Math.sin(a));
      },
    };
    chart.sections.forEach((s, i) => {
      if (RHYTHM_MODES[s.mode].realm !== 'deep') return;
      this.travel.set(i, travelMsOf(chart, s.mode, cfg.travelBeats));
      this.modes.set(i, createRhythmMode(s.mode, { ...mctx, travelMs: this.travel.get(i)! }, notes.filter(n => n.section === i)));
    });
    this.hands = new BossHands(this.root, w / DIVIDERS);
    this.laneOf = (lane, lanes) => (lane + 0.5) / lanes * w - w / 2;
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
      this.fly(dtMs / cfg.enterMs, this.entry.spot(), this.eye, this.quat, 1, cfg.heroScale, 0, cfg.screenTilt, () => { this.phase = 'play'; this.land(); });
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
      // Game Master 在操控屏幕：每拍往后点一下头，左右慢慢歪（两小节一个来回）
      const beats = (now - chart.offsetMs) / beatMs(chart), phase = ((beats % 1) + 1) % 1;
      this.ctx.screen.setTilt(this.tilt + cfg.sway.nodDeg * Math.exp(-phase * 5));
      this.ctx.screen.setRoll(cfg.sway.screenRollDeg * Math.sin(beats / 8 * Math.PI * 2));
    }
    this.spread(dtMs);
    const now = this.o.session.conductor.timeMs();
    this.modes.forEach(m => m.draw(now));
    // 音符出发的那一刻，Game Master 的手在那条道上方往下一松
    for (const all = this.o.session.notes; this.nextNote < all.length; this.nextNote++) {
      const n = all[this.nextNote], travel = this.travel.get(n.section);
      if (travel !== undefined && n.timeMs - travel > now) break;
      if (travel !== undefined && now - (n.timeMs - travel) < travel) this.hands.drop(this.laneOf(n.lane, RHYTHM_MODES[chart.sections[n.section].mode].lanes));
    }
    // 手：进场时跟着伸出来，离场时缩回去
    this.hands.update(dtMs, this.phase === 'in' ? this.k : this.phase === 'play' ? 1 : this.phase === 'back' ? 1 - this.k : 0);
    return true;
  }

  /** 请它收场（中途退出） */
  end(): void { if (this.phase === 'in' || this.phase === 'play') this.leave(); }

  dispose(): void {
    this.input.dispose();
    this.modes.forEach(m => m.dispose());
    this.hands.dispose();
    this.root.removeFromParent();
    this.hero.dispose();
    this.disposables.forEach(d => d.dispose());
    this.ctx.screen.setTilt(0); this.ctx.screen.setRoll(0);
    this.ctx.resetCamera();
  }

  /** 落地那一下：脚下荡开一圈，镜头往下一沉（之后跟着机位自己回上来） */
  private land(): void {
    const at = this.hero.position;
    this.ring.position.set(at.x, 0.05, at.z);
    this.ringLeft = BREAK.ringMs;
    this.ctx.camera.position.y -= BREAK.jolt * this.root.scale.y;
  }

  private spread(dtMs: number): void {
    if (this.ringLeft <= 0) { this.ring.visible = false; return; }
    this.ringLeft -= dtMs;
    const k = 1 - Math.max(0, this.ringLeft) / BREAK.ringMs;
    this.ring.visible = true;
    this.ring.scale.setScalar(1 + (BREAK.ringSize - 1) * (1 - (1 - k) ** 2));
    this.ring.material.opacity = 0.9 * (1 - k);
  }

  private leave(): void {
    this.phase = 'back'; this.k = 0;
    this.ctx.screen.setRoll(0);
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
    if (c.roll) this.quat.multiply(this.rollQuat.setFromAxisAngle(FORWARD, -THREE.MathUtils.degToRad(c.roll)));   // 绕镜头自己朝前的轴歪
  }

  /** 人和镜头一起从一处飞到另一处（进场、回画面）：人走一条弧线，大小从 s0 变到 s1，屏幕从倒 t0 度变到 t1 度 */
  private fly(step: number, to: THREE.Vector3, cam: THREE.Vector3, quat: THREE.Quaternion, s0: number, s1: number, t0: number, t1: number, then: () => void): void {
    this.k = Math.min(1, this.k + (Number.isFinite(step) ? step : 1));
    const e = this.k < 0.5 ? 2 * this.k * this.k : 1 - (-2 * this.k + 2) ** 2 / 2, f = this.from;
    this.hero.place(
      f.hero.x + (to.x - f.hero.x) * e, f.hero.y + (to.y - f.hero.y) * e + Math.sin(Math.PI * e) * ENTER_ARC, f.hero.z + (to.z - f.hero.z) * e,
      s0 + (s1 - s0) * e,
    );
    // 进场：屏幕倒过头再弹回来一点，大道跟着铺开；回画面：老老实实扶起来、收回去
    const entering = this.phase === 'in';
    this.tilt = t0 + (t1 - t0) * (entering ? easeOutBack(this.k, BREAK.overshoot) : e);
    this.ctx.screen.setTilt(this.tilt);
    this.road.scale.z = Math.max(0.001, entering ? Math.min(1, this.k / BREAK.unroll) : 1 - e);
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
    this.road.add(ground);
    const lift = 0.02, dividers: number[] = [];
    for (let i = 0; i <= DIVIDERS; i++) { const x = i * w / DIVIDERS - w / 2; dividers.push(x, lift, 0, x, lift, len); }
    this.disposables.push(plane, fill, guideLines(this.road, dividers, Colors.paper), guideLines(this.road, [-w / 2, lift, heroZ, w / 2, lift, heroZ], Colors.gold));
  }
}
