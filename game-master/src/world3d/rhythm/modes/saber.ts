// ===== 节奏光剑：方块沿四条道冲过来，上面画着方向，到跟前时按那个方向把它砍掉 =====
import * as THREE from 'three';
import { noteProgress, NoteTrack, RHYTHM_MODES } from '@/rhythm';
import { Colors } from '@/game/palette';
import { Bursts, defineRhythmMode, NoteBoxes } from './define';

const LANES = RHYTHM_MODES.saber.lanes;
/** 方块边长（格）、离地多高；过了主角那一排还飞多远才消失（进度）；同时最多画多少个 */
const BLOCK = { size: 2.6, lift: 0.6, past: 1.15, max: 64 };
/** 镜头：比「躲」低、近，贴着道面往前看（屏幕宽的倍数） */
const CAMERA = { back: 0.62, height: 0.4, lookY: 0.14, lookZ: 0.2 };
/** 击中反馈：砍中的方块炸开多久（毫秒）、放大到几倍；人鼓到几倍、多久；漏了人闪多久、多透；每种判定炸什么颜色 */
const FEEL = { burstMs: 220, burstGrow: 1.9, pop: 1.18, popMs: 90, missMs: 220, missAlpha: 0.35, color: { perfect: Colors.gold, good: Colors.sky, miss: Colors.rose } };
/** 方向 → 谱面上的字符、箭头转多少（箭头默认朝上；绕朝镜头的轴转） */
const DIRS = { up: { char: '^', turn: 0 }, left: { char: '<', turn: Math.PI / 2 }, down: { char: 'v', turn: Math.PI }, right: { char: '>', turn: -Math.PI / 2 } } as const;
type Dir = keyof typeof DIRS;
const TURN: Record<string, number> = Object.fromEntries(Object.values(DIRS).map(d => [d.char, d.turn]));

defineRhythmMode('saber', (ctx, notes) => {
  const laneW = ctx.w / LANES, laneX = (lane: number) => (lane + 0.5) * laneW - ctx.w / 2;
  const track = new NoteTrack(notes, ctx.score);
  const blocks = new NoteBoxes(ctx.root, BLOCK.size, BLOCK.size, BLOCK.size, Colors.violet, BLOCK.max);
  // 箭头：贴在方块朝镜头那一面上的三角形
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.36); shape.lineTo(0.32, -0.26); shape.lineTo(-0.32, -0.26); shape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(shape), arrowMat = new THREE.MeshBasicMaterial({ color: Colors.paper });
  const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, BLOCK.max);
  arrows.count = 0; arrows.frustumCulled = false;
  ctx.root.add(arrows);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1), pos = new THREE.Vector3(), scale = new THREE.Vector3(BLOCK.size, BLOCK.size, 1);
  const spot = new THREE.Vector3(0, 0, ctx.heroZ);
  const bursts = new Bursts(ctx.root, FEEL.burstMs, FEEL.burstGrow, 8);
  /** 人还要鼓多久 / 闪多久（毫秒） */
  let first = 0, popLeft = 0, missLeft = 0;

  return {
    camera: () => ({
      eye: new THREE.Vector3(0, CAMERA.height * ctx.w, ctx.heroZ + CAMERA.back * ctx.w),
      look: new THREE.Vector3(0, CAMERA.lookY * ctx.w, CAMERA.lookZ * ctx.w),
    }),
    spot: () => spot,
    setActive() { popLeft = 0; missLeft = 0; ctx.hero.fade(1); },
    update(now, dt, move) {
      const cfg = ctx.config();
      for (const dir of Object.keys(DIRS) as Dir[]) {
        if (!move.press[dir]) continue;
        const hit = track.press(now, cfg.windows, n => n.char === DIRS[dir].char);
        if (!hit) continue;
        // 砍中：方块当场消失，原地炸开一个放大淡出的方块，人鼓一下
        bursts.spawn(laneX(hit.note.lane), BLOCK.lift + BLOCK.size / 2, ctx.heroZ, BLOCK.size, FEEL.color[hit.judgement]);
        popLeft = FEEL.popMs;
      }
      if (track.sweep(now, cfg.windows).length) missLeft = FEEL.missMs;
      popLeft = Math.max(0, popLeft - dt * 1000); missLeft = Math.max(0, missLeft - dt * 1000);
      bursts.update(dt * 1000);
      ctx.hero.place(spot.x, 0, spot.z, cfg.heroScale * (popLeft > 0 ? FEEL.pop : 1));
      ctx.hero.fade(missLeft > 0 ? FEEL.missAlpha : 1);
      ctx.hero.castShadow(0);
    },
    draw(now) {
      blocks.begin();
      let n = 0;
      while (first < notes.length && noteProgress(notes[first], now, ctx.travelMs) > BLOCK.past) first++;
      for (let i = first; i < notes.length; i++) {
        const note = notes[i], p = noteProgress(note, now, ctx.travelMs);
        if (p < 0) break;
        if (track.done.has(i)) continue;   // 砍掉的不画了
        const x = laneX(note.lane), z = p * ctx.heroZ;
        blocks.put(x, BLOCK.lift, z);
        if (n < BLOCK.max) arrows.setMatrixAt(n++, m.compose(pos.set(x, BLOCK.lift + BLOCK.size / 2, z + BLOCK.size / 2 + 0.02), q.setFromAxisAngle(axis, TURN[note.char] ?? 0), scale));
      }
      blocks.end();
      arrows.count = n; arrows.instanceMatrix.needsUpdate = true;
    },
    dispose() { bursts.dispose(); blocks.dispose(); arrows.removeFromParent(); arrows.dispose(); arrowGeo.dispose(); arrowMat.dispose(); },
  };
});
