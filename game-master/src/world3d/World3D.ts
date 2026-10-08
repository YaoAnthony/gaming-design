// ===== 3D 世界：主角从画面里跳出来之后的关卡 =====
// 跑在 3D 舞台上（是舞台上一个放很久的「特效」）：2D 游戏的画面还立在那、照常在动，人在它前面的 3D 关卡里走和跳。
// 一开始人就在画面上他原来的位置，带着往外、往上的速度飞出来，落地之后才归玩家管；
// 走回画面（碰到屏幕）就回 2D：从哪碰到的就落在画面的哪（那里是墙就由 2D 一侧挪到旁边的空地）。
// 在这里按 R（2D 一侧照常处理）：披风骷髅出来把屏幕攥成纸团扔掉，这期间镜头拉远看着它、人不听按键。
// 坐标和单位见 level.ts：原点在屏幕底边中点，单位是格。
import * as THREE from 'three';
import { bridge, EVT, type CrumpleDone, type HeroEntryQuery, type HeroHandoff, type ScreenSpot } from '@/protocol';
import type { World3DConfig } from '@/type';
import type { StageFxContext, StageFxRun } from '@/stage3d/fx/define';
import type { Level3D, Vec3 } from './level';
import { groundBelow, stepBody, type Body3D } from './physics';
import { Hero3D } from './Hero3D';
import { Actors3D } from './Actors3D';
import { LevelView } from './LevelView';
import { WorldInput } from './input';

/** 一帧最多按多久算（毫秒）：切到别的标签页再回来，不让人一步穿过地面 */
const MAX_STEP_MS = 50;
/** 人的碰撞宽度占贴图宽度的多少（和 2D 里一样比贴图窄一点） */
const BODY_WIDTH = 0.8;
/** 碰到屏幕算走回画面：屏幕前面这么厚（格）的一层；人要先离开屏幕这么远才开始算（刚跳出来时就在屏幕上） */
const EXIT = { depth: 0.3, arm: 1.5 };
/**
 * 屏幕被攥成纸团时镜头摆在哪看：往屏幕左边偏多少（屏幕宽的比例，骷髅站在左边）、多高（屏幕高的比例）、
 * 比正对屏幕时再退多远（倍数）
 */
const WATCH = { shift: 0.3, height: 0.5, pullBack: 1.7 };

export interface World3DOptions {
  config(): World3DConfig;
  level: Level3D;
  /** 主角 3D 模型的地址（asset 的 MODELS.hero） */
  heroUrl: string;
  /** 人走回画面、镜头也回到原位了：把人交还给 2D 游戏。at = 落在画面的哪，null = 原地 */
  onExit(at: ScreenSpot | null): void;
  /** 游戏暂停着（暂停菜单开着）：人和镜头都停在原地 */
  paused?(): boolean;
}

/** out = 刚跳出来还在空中；play = 归玩家管；back = 正走回画面；handing = 已经交还，多留一帧等 2D 把人画出来；done = 收场 */
type Phase = 'out' | 'play' | 'back' | 'handing' | 'done';

export class World3D implements StageFxRun {
  /** 关卡的根：放在屏幕底边中点，放大到一格 = 画面上一格砖那么大 */
  private readonly root = new THREE.Group();
  private readonly view: LevelView;
  private readonly hero: Hero3D;
  private readonly actors: Actors3D;
  private readonly input = new WorldInput();
  private readonly light = new THREE.Vector3();
  private readonly body: Body3D;
  /** 屏幕的宽高（格）、人在画面上原来的位置（脚底中心，格） */
  private readonly screen: { w: number; h: number };
  private readonly home: Vec3;
  private readonly unit: number;
  private phase: Phase = 'out';
  private facing: 1 | -1;
  /** 人离开过屏幕了（之后再碰到屏幕才算走回去） */
  private armed = false;
  /** 相机原来的位置（正对屏幕） */
  private readonly camHome: THREE.Vector3;
  private back = { k: 0, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), fromHero: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, at: null as ScreenSpot | null };
  /** 屏幕正被攥成纸团：镜头看着它，人不听按键。watchLeft = 纸团扔掉后新画面还要淡入多久（毫秒），null = 还没扔 */
  private watching = false;
  private watchLeft: number | null = null;
  // 每帧复用
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly aim = new THREE.Matrix4();
  private readonly aimQuat = new THREE.Quaternion();

  constructor(private readonly ctx: StageFxContext, handoff: HeroHandoff, private readonly o: World3DOptions) {
    const size = ctx.screen.size, base = ctx.screen.base;
    this.unit = handoff.tile * size.w;
    this.screen = { w: size.w / this.unit, h: size.h / this.unit };
    this.root.position.set(base.x, base.y, 0);
    this.root.scale.setScalar(this.unit);

    const w = handoff.w * this.screen.w, h = handoff.h * this.screen.h;
    this.home = { x: (handoff.x - 0.5) * this.screen.w, y: (1 - handoff.y) * this.screen.h - h / 2, z: 0 };
    const cfg = o.config();
    this.body = { pos: { ...this.home }, vel: { x: 0, y: cfg.popOut.up, z: cfg.popOut.out }, half: w * BODY_WIDTH / 2, height: h, grounded: false };
    this.facing = handoff.facing;

    this.view = new LevelView(o.level);
    this.hero = new Hero3D(o.heroUrl, w, h);
    this.actors = new Actors3D(o.level.actors ?? [], () => this.o.config().actors, () => this.body.pos);
    this.root.add(this.view.object, this.hero.object, this.actors.object);
    ctx.scene.add(this.root);
    this.camHome = ctx.camera.position.clone();
    if (import.meta.env.DEV) window.__world3d = this;   // 控制台调试：看关卡里的演员、人在哪
    this.syncHero(1);
    bridge.on(EVT.crumple, this.onCrumple); bridge.on(EVT.crumpleDone, this.onCrumpleDone);
  }

  private readonly onCrumple = (): void => { this.watching = true; this.watchLeft = null; };
  private readonly onCrumpleDone = (d: CrumpleDone): void => { if (this.watching) this.watchLeft = d.fadeMs; };

  update(dtMs: number): boolean {
    if (this.phase === 'done') return false;
    if (this.phase === 'handing') { this.phase = 'done'; return false; }
    if (this.o.paused?.()) return true;
    const dt = Math.min(dtMs, MAX_STEP_MS) / 1000;
    if (this.phase === 'back') { this.stepBack(dtMs); this.animate(dt); return true; }

    const cfg = this.o.config(), b = this.body, move = this.input.read();
    if (this.watching && this.watchLeft !== null && (this.watchLeft -= dtMs) <= 0) this.watching = false;
    if (this.watching) { if (this.phase === 'play') { b.vel.x = 0; b.vel.z = 0; } }
    else if (this.phase === 'play') {
      const len = Math.hypot(move.x, move.z) || 1;
      b.vel.x = move.x / len * cfg.moveSpeed; b.vel.z = move.z / len * cfg.moveSpeed;
      if (move.jump && b.grounded) b.vel.y = cfg.jumpVelocity;
      if (move.x !== 0) this.facing = move.x > 0 ? 1 : -1;
    }
    stepBody(b, this.o.level.blocks, dt, cfg.gravity, cfg.maxFall);
    if (this.phase === 'out' && b.grounded) { this.phase = 'play'; b.vel.x = 0; b.vel.z = 0; }
    if (b.pos.y < this.o.level.killY) { b.pos = { ...this.o.level.respawn }; b.vel = { x: 0, y: 0, z: 0 }; }

    if (b.pos.z - b.half > EXIT.arm) this.armed = true;
    if (this.armed && this.phase === 'play' && !this.watching && this.touchingScreen()) this.startBack(true);

    this.syncHero(1);
    this.hero.move(b.vel, b.grounded);
    if (this.watching) this.watch(dt, cfg); else this.follow(dt, cfg);
    this.animate(dt);
    return true;
  }

  /** 每帧推进角色的动作，光按镜头换算 */
  private animate(dt: number): void {
    const t = this.o.config().toon, cam = this.ctx.camera;
    this.light.set(t.dir[0], t.dir[1], t.dir[2]).normalize();
    this.hero.update(dt);
    this.actors.update(dt);
    this.hero.setLight(this.light, cam, t.ambient, t.aoPower);
    this.actors.setLight(this.light, cam, t.ambient, t.aoPower);
  }

  /** 请它收场：立刻往回走，回到跳出来的地方 */
  end(): void { if (this.phase === 'out' || this.phase === 'play') this.startBack(false); }

  dispose(): void {
    bridge.off(EVT.crumple, this.onCrumple); bridge.off(EVT.crumpleDone, this.onCrumpleDone);
    this.input.dispose();
    this.root.removeFromParent();
    this.view.dispose();
    this.hero.dispose();
    this.actors.dispose();
    this.ctx.resetCamera();
  }

  private touchingScreen(): boolean {
    const b = this.body;
    return b.pos.z - b.half <= EXIT.depth && Math.abs(b.pos.x) <= this.screen.w / 2 && b.pos.y < this.screen.h;
  }

  /**
   * 开始往回走。here = 从碰到屏幕的地方进去：问 2D 一侧那里能不能站（是墙就给旁边的空地），人飞到那；
   * 否则（或者 2D 一侧没答）回到跳出来的地方
   */
  private startBack(here: boolean): void {
    const b = this.body, s = this.screen;
    let to = this.home, at: ScreenSpot | null = null;
    if (here) {
      const q: HeroEntryQuery = { want: { x: b.pos.x / s.w + 0.5, y: 1 - (b.pos.y + b.height / 2) / s.h } };
      bridge.emit(EVT.heroEntry, q);
      if (q.answer) { at = q.answer; to = { x: (at.x - 0.5) * s.w, y: (1 - at.y) * s.h - b.height / 2, z: 0 }; }
    }
    this.phase = 'back';
    this.back = { k: 0, fromPos: this.ctx.camera.position.clone(), fromQuat: this.ctx.camera.quaternion.clone(), fromHero: { ...b.pos }, to, at };
  }

  /** 走回画面：人飞到画面上要落的位置，镜头回到正对屏幕 */
  private stepBack(dtMs: number): void {
    const ms = this.o.config().returnMs, k = this.back.k = ms > 0 ? Math.min(1, this.back.k + dtMs / ms) : 1;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const f = this.back.fromHero, b = this.body;
    const to = this.back.to;
    b.pos.x = f.x + (to.x - f.x) * e; b.pos.y = f.y + (to.y - f.y) * e; b.pos.z = f.z + (to.z - f.z) * e;
    this.syncHero(1);
    const cam = this.ctx.camera;
    cam.position.lerpVectors(this.back.fromPos, this.camHome, e);
    cam.quaternion.slerpQuaternions(this.back.fromQuat, this.aimQuat.identity(), e);
    if (k >= 1) { this.phase = 'handing'; this.o.onExit(this.back.at); }
  }

  private syncHero(scale: number): void {
    const b = this.body;
    this.hero.place(b.pos.x, b.pos.y, b.pos.z, scale);
    this.hero.face(this.facing);
    this.hero.castShadow(groundBelow(b, this.o.level.blocks));
  }

  /** 屏幕正被攥成纸团：镜头退到屏幕前面偏左的地方，把屏幕和站在左边的骷髅都框进来 */
  private watch(dt: number, cfg: World3DConfig): void {
    const s = this.screen, cam = this.ctx.camera;
    const k = cfg.camera.followMs > 0 ? 1 - Math.exp(-dt * 1000 / cfg.camera.followMs) : 1;
    this.look.set(-WATCH.shift * s.w, WATCH.height * s.h, 0);
    this.root.localToWorld(this.look);
    this.eye.set(this.look.x, this.look.y, this.camHome.z * WATCH.pullBack);
    cam.position.lerp(this.eye, k);
    this.aim.lookAt(cam.position, this.look, cam.up);
    cam.quaternion.slerp(this.aimQuat.setFromRotationMatrix(this.aim), k);
  }

  /** 镜头跟在人身后（+z 那边）、高一点，看向人；慢慢跟上，不硬切 */
  private follow(dt: number, cfg: World3DConfig): void {
    const b = this.body, c = cfg.camera, cam = this.ctx.camera;
    const k = c.followMs > 0 ? 1 - Math.exp(-dt * 1000 / c.followMs) : 1;
    this.look.set(b.pos.x, b.pos.y + c.lookUp, b.pos.z);
    this.eye.set(b.pos.x, b.pos.y + c.height, b.pos.z + c.distance);
    this.root.localToWorld(this.look); this.root.localToWorld(this.eye);
    cam.position.lerp(this.eye, k);
    this.aim.lookAt(cam.position, this.look, cam.up);
    cam.quaternion.slerp(this.aimQuat.setFromRotationMatrix(this.aim), k);
  }
}
