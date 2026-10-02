// ===== 节奏光剑：贴着道面往前冲的视角，方块沿四条道迎面过来；A / D 左右换道（镜头跟着往那边歪），方块到跟前时按空格一剑砍掉 =====
// 要砍的方块得在自己这条道上：先换过去，再看准了砍。
import * as THREE from 'three';
import { noteProgress, NoteTrack, RHYTHM_MODES } from '@/rhythm';
import { Colors } from '@/game/palette';
import { Bursts, defineRhythmMode, NoteBoxes } from './define';

const LANES = RHYTHM_MODES.saber.lanes;
/** 方块边长（格）、离地多高；过了主角那一排还飞多远才消失（进度）；同时最多画多少个 */
const BLOCK = { size: 2.6, lift: 0.6, past: 1.15, max: 64 };
/**
 * 镜头：低低地跟在人身后，顺着道往前看（屏幕宽的倍数）。follow = 镜头左右跟人跟几成（1 = 一直在人正后方）；
 * 人不在正中时镜头往那边歪多少度（每条道）；换道的那一下再多歪多少度、多久回正（毫秒）
 */
const CAMERA = { back: 0.55, height: 0.3, lookY: 0.1, lookZ: 0.1, follow: 0.7, lean: 5, bank: 14, bankMs: 260 };
/** 这种玩法里人画多大（倍数）：比别的玩法小，不挡着迎面来的方块 */
const HERO_SCALE = 1.3;
/** 击中反馈：砍中的方块炸开多久（毫秒）、放大到几倍；人鼓到几倍、多久；漏了人闪多久、多透；每种判定炸什么颜色 */
const FEEL = { burstMs: 220, burstGrow: 1.9, pop: 1.18, popMs: 90, missMs: 220, missAlpha: 0.35, color: { perfect: Colors.gold, good: Colors.sky, miss: Colors.rose } };
/** 剑光：砍的那一下人面前横着亮一道。多宽、多高（格）、亮多久（毫秒） */
const SLASH = { width: 4.2, height: 0.5, ms: 110 };

defineRhythmMode('saber', (ctx, notes) => {
  const laneW = ctx.w / LANES, laneX = (lane: number) => (lane + 0.5) * laneW - ctx.w / 2;
  const track = new NoteTrack(notes, ctx.score);
  const blocks = new NoteBoxes(ctx.root, BLOCK.size, BLOCK.size, BLOCK.size, Colors.violet, BLOCK.max);
  const bursts = new Bursts(ctx.root, FEEL.burstMs, FEEL.burstGrow, 8);
  const slashGeo = new THREE.PlaneGeometry(SLASH.width, SLASH.height), slashMat = new THREE.MeshBasicMaterial({ color: Colors.paper, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const slash = new THREE.Mesh(slashGeo, slashMat);
  slash.visible = false;
  ctx.root.add(slash);
  const spot = new THREE.Vector3();
  /** 人在第几条道上；镜头换道那一下的歪（度，慢慢回正）；人还要鼓多久 / 闪多久、剑光还亮多久（毫秒）；这个下标之前的方块都飞过去了 */
  let lane = 1, bank = 0, first = 0, popLeft = 0, missLeft = 0, slashLeft = 0;

  return {
    camera: () => {
      const x = laneX(lane);
      return {
        eye: new THREE.Vector3(x * CAMERA.follow, CAMERA.height * ctx.w, ctx.heroZ + CAMERA.back * ctx.w),
        look: new THREE.Vector3(x * CAMERA.follow, CAMERA.lookY * ctx.w, CAMERA.lookZ * ctx.w),
        roll: (lane - (LANES - 1) / 2) * CAMERA.lean + bank,
      };
    },
    spot: () => spot.set(laneX(lane), 0, ctx.heroZ),
    setActive() { popLeft = 0; missLeft = 0; slashLeft = 0; bank = 0; slash.visible = false; ctx.hero.fade(1); bursts.clear(); },
    update(now, dt, move) {
      const cfg = ctx.config(), dtMs = dt * 1000;
      // 左右换道：镜头往那边猛歪一下再回正
      const dir = +move.press.right - +move.press.left;
      if (dir !== 0) {
        const to = Math.max(0, Math.min(LANES - 1, lane + dir));
        if (to !== lane) { lane = to; bank = dir * CAMERA.bank; ctx.hero.face(dir > 0 ? 1 : -1); }
      }
      bank *= Math.exp(-dtMs / CAMERA.bankMs);
      // 空格：砍自己这条道上到跟前的方块
      if (move.jump) {
        slashLeft = SLASH.ms;
        const hit = track.press(now, cfg.windows, n => n.lane === lane);
        if (hit) {
          bursts.spawn(laneX(lane), BLOCK.lift + BLOCK.size / 2, ctx.heroZ - BLOCK.size, BLOCK.size, FEEL.color[hit.judgement]);   // 在人前面炸，不糊在人身上
          popLeft = FEEL.popMs;
        }
      }
      if (track.sweep(now, cfg.windows).length) missLeft = FEEL.missMs;
      popLeft = Math.max(0, popLeft - dtMs); missLeft = Math.max(0, missLeft - dtMs); slashLeft = Math.max(0, slashLeft - dtMs);
      bursts.update(dtMs);
      slash.visible = slashLeft > 0;
      slash.position.set(laneX(lane), BLOCK.lift + BLOCK.size / 2, ctx.heroZ - 1.2);
      slashMat.opacity = slashLeft / SLASH.ms;
      ctx.hero.place(laneX(lane), 0, ctx.heroZ, HERO_SCALE * (popLeft > 0 ? FEEL.pop : 1));
      ctx.hero.fade(missLeft > 0 ? FEEL.missAlpha : 1);
      ctx.hero.castShadow(0);
    },
    draw(now) {
      blocks.begin();
      while (first < notes.length && noteProgress(notes[first], now, ctx.travelMs) > BLOCK.past) first++;
      for (let i = first; i < notes.length; i++) {
        const note = notes[i], p = noteProgress(note, now, ctx.travelMs);
        if (p < 0) break;
        if (!track.done.has(i)) blocks.put(laneX(note.lane), BLOCK.lift, p * ctx.heroZ);   // 砍掉的不画了
      }
      blocks.end();
    },
    dispose() { bursts.dispose(); blocks.dispose(); slash.removeFromParent(); slashGeo.dispose(); slashMat.dispose(); },
  };
});
