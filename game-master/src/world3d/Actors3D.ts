// ===== 3D 关卡里的演员：Game Master 本体（站着，两只木手挂在手腕上）和夹子桑（在地板上来回走，人靠近就咬一口）=====
// 哪些演员、站哪、走哪由关卡数据（level.actors）定，模型都是 3D asset/ 下导出的 glb（stage3d/characters/CharacterModel）。
import * as THREE from 'three';
import { MODELS } from '@/asset';
import type { ActorsConfig } from '@/type';
import { BOSS_PALETTE, CLIP_PALETTE, GM_HAND_PALETTE } from '@/shared/palette';
import { CharacterModel } from '@/stage3d/characters/CharacterModel';
import { HandModel } from '@/stage3d/hand/HandModel';
import { ToonPaletteMaterial } from '@/stage3d/hand/ToonPaletteMaterial';
import type { Actor3D, Vec3 } from './level';
import { stepPatrol, type PatrolState } from './patrol';

/** 夹子桑：人离得比这近（格）就咬；咬完歇多久（秒） */
const BITE = { range: 2.2, cooldown: 1.6 };
/** 木手的哪些部件不要（Boss 自己有前臂） */
const HAND_HIDE = ['GMH_arm', 'GMH_arm_joint'];

interface BossHand {
  hand: HandModel;
  anchor: THREE.Object3D;
  elbow: THREE.Object3D;
  /** 右手（看的人的左边）是左手的镜像 */
  mirror: boolean;
  pose: 'open' | 'fist' | 'point' | 'pinch' | 'grip';
  roll: number;
}

interface Run {
  actor: Actor3D;
  model: CharacterModel;
  patrol?: PatrolState;
  hands: BossHand[];
  yaw: number;
  biteLeft: number;
}

export class Actors3D {
  readonly object = new THREE.Group();
  private readonly runs: Run[] = [];
  private readonly handMaterials = new Map<string, ToonPaletteMaterial>();
  private disposed = false;
  // 每帧复用
  private readonly pw = new THREE.Vector3();
  private readonly pe = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly y = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qa = new THREE.Quaternion();

  constructor(actors: Actor3D[], private readonly cfg: () => ActorsConfig, private readonly hero: () => Vec3) {
    for (const actor of actors) void this.spawn(actor);
  }

  private async spawn(actor: Actor3D): Promise<void> {
    const c = this.cfg();
    try {
      if (actor.kind === 'boss') {
        const model = await CharacterModel.load(MODELS.boss, { palette: BOSS_PALETTE, fallback: 'wood' });
        if (this.disposed) { model.dispose(); return; }
        model.setHeight(c.bossHeight);
        model.play('idle', 0);
        const hands: BossHand[] = [];
        for (const [side, mirror, spec] of [['L', false, c.bossHands.left], ['R', true, c.bossHands.right]] as const) {
          const anchor = model.part(`anchor_hand.${side}`), elbow = model.part(`elbow.${side}`);
          if (!anchor || !elbow) continue;
          const hand = await HandModel.load(MODELS.gmHand, name => this.handMaterial(name));
          if (this.disposed) { hand.dispose(); return; }
          for (const n of HAND_HIDE) { const o = hand.root.getObjectByName(n); if (o) o.visible = false; }
          hand.setPose(spec.pose, 0);
          anchor.add(hand.root);
          hands.push({ hand, anchor, elbow, mirror, pose: spec.pose, roll: spec.roll });
        }
        this.add({ actor, model, hands, yaw: THREE.MathUtils.degToRad(actor.yaw ?? 0), biteLeft: 0 });
      } else {
        const model = await CharacterModel.load(MODELS.clip, { palette: CLIP_PALETTE, fallback: 'clip_wood' });
        if (this.disposed) { model.dispose(); return; }
        model.setHeight(c.clipHeight);
        model.play(actor.patrol ? 'walk' : 'idle', 0);
        this.add({ actor, model, hands: [], patrol: actor.patrol ? { k: 0, dir: 1 } : undefined, yaw: THREE.MathUtils.degToRad(actor.yaw ?? 0), biteLeft: 0 });
      }
    } catch (err) {
      console.error(`${actor.kind} 的模型读不进来`, err);
    }
  }

  private add(run: Run): void {
    run.model.root.position.set(run.actor.at.x, run.actor.at.y, run.actor.at.z);
    run.model.root.rotation.y = run.yaw;
    this.object.add(run.model.root);
    this.runs.push(run);
  }

  private handMaterial(name: string): THREE.Material {
    let m = this.handMaterials.get(name);
    if (!m) {
      m = new ToonPaletteMaterial(GM_HAND_PALETTE[name] ?? GM_HAND_PALETTE.wood);
      this.handMaterials.set(name, m);
    }
    return m;
  }

  update(dtSec: number): void {
    const c = this.cfg(), hero = this.hero();
    for (const r of this.runs) {
      if (r.actor.kind === 'clip') this.stepClip(r, dtSec, c, hero);
      r.model.update(dtSec);
      for (const h of r.hands) { h.hand.update(dtSec); this.placeHand(r, h, c); }
    }
  }

  /** 夹子桑：来回走；人走近了停下咬一口（咬完接着走） */
  private stepClip(r: Run, dt: number, c: ActorsConfig, hero: Vec3): void {
    const m = r.model, at = m.root.position;
    const near = Math.hypot(hero.x - at.x, hero.z - at.z) < BITE.range && Math.abs(hero.y - at.y) < c.clipHeight * 2;
    if (m.playing === 'attack') {
      if (!m.finished()) return;
      r.biteLeft = BITE.cooldown;
      m.play(r.patrol ? 'walk' : 'idle', 0.1);
    }
    r.biteLeft = Math.max(0, r.biteLeft - dt);
    if (near && r.biteLeft <= 0) { m.play('attack', 0.05, true); return; }
    if (r.patrol && r.actor.patrol) {
      const { at: p, heading } = stepPatrol({ from: r.actor.at, to: r.actor.patrol.to, speed: c.clipSpeed }, r.patrol, dt);
      m.root.position.set(p.x, p.y, p.z);
      // 它是正面朝着镜头横着走的：只在往 z 走时才转身
      if (Math.abs(heading.z) > 0.5) m.root.rotation.y = Math.atan2(heading.x, heading.z);
    }
  }

  /** 木手挂在手腕上：指尖顺着前臂往下，拇指朝前（Boss 自己的 +z）；右手镜像 */
  private placeHand(r: Run, h: BossHand, c: ActorsConfig): void {
    h.anchor.getWorldPosition(this.pw);
    h.elbow.getWorldPosition(this.pe);
    this.x.subVectors(this.pw, this.pe).normalize();
    this.fwd.set(0, 0, 1).applyQuaternion(r.model.root.getWorldQuaternion(this.q));
    this.z.copy(this.fwd).addScaledVector(this.x, -this.fwd.dot(this.x)).normalize();
    this.y.crossVectors(this.z, this.x);
    this.basis.makeBasis(this.x, this.y, this.z);
    this.q.setFromRotationMatrix(this.basis);
    this.qa.setFromAxisAngle(this.x, THREE.MathUtils.degToRad(h.roll));
    this.q.premultiply(this.qa);
    h.anchor.getWorldQuaternion(this.qa).invert();
    h.hand.root.quaternion.copy(this.qa).multiply(this.q);
    const k = c.bossHandLength / h.hand.length;
    h.hand.root.scale.set(k, h.mirror ? -k : k, k);
  }

  setLight(dirWorld: THREE.Vector3, camera: THREE.Camera, ambient: number, aoPower: number): void {
    for (const r of this.runs) r.model.setLight(dirWorld, camera, ambient, aoPower);
    if (this.handMaterials.size) {
      this.q.copy(camera.quaternion).invert();
      this.z.copy(dirWorld).applyQuaternion(this.q);
      for (const m of this.handMaterials.values()) m.setLight({ dir: [this.z.x, this.z.y, this.z.z], ambient, aoPower });
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const r of this.runs) { for (const h of r.hands) h.hand.dispose(); r.model.dispose(); }
    this.runs.length = 0;
    for (const m of this.handMaterials.values()) m.dispose();
    this.object.removeFromParent();
  }
}
