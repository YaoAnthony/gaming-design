// ===== 躲：四条道，弹幕从屏幕里冲过来，左右换道躲，贴地的横杠跳过去。被打中算 Miss，躲过去算 Perfect =====
import * as THREE from 'three';
import { noteProgress, RHYTHM_MODES, struck } from '@/rhythm';
import { Colors } from '@/game/palette';
import { defineRhythmMode, NoteBoxes } from './define';

const LANES = RHYTHM_MODES.dodge.lanes;
/** 弹幕、横杠：占道宽的多少、多高、多厚（格）；过了主角那一排还飞多远才消失（进度）；同时最多画多少个 */
const SHAPE = { orb: { width: 0.62, height: 1.8, depth: 1 }, bar: { width: 0.96, height: 0.4, depth: 0.6 }, past: 1.25, max: 128 };
/** 被打中后人一闪一闪多久、一亮一暗各多久（毫秒）、暗的时候多透 */
const HURT = { ms: 450, flickerMs: 70, alpha: 0.25 };
/** 镜头：在主角那一排身后多远、多高，看向哪（离地多高、离屏幕多远），都是屏幕宽的倍数。高高地俯看，四条道和整块屏幕都在画面里 */
const CAMERA = { back: 1.0, height: 0.55, lookY: 0.2, lookZ: 0.17 };

defineRhythmMode('dodge', (ctx, notes) => {
  const laneW = ctx.w / LANES, laneX = (lane: number) => (lane + 0.5) * laneW - ctx.w / 2;
  const orbs = new NoteBoxes(ctx.root, SHAPE.orb.width * laneW, SHAPE.orb.height, SHAPE.orb.depth, Colors.rose, SHAPE.max);
  const bars = new NoteBoxes(ctx.root, SHAPE.bar.width * laneW, SHAPE.bar.height, SHAPE.bar.depth, Colors.gold, SHAPE.max);
  /** 站在第几条道、脚离地多高、往上的速度；打中过的弹幕；这个下标之前的都飞过去了 / 都判过了 */
  let lane = Math.floor(LANES / 2), feetY = 0, velY = 0, first = 0, judged = 0, hurtLeft = 0;
  const spent = new Set<number>();
  const spot = new THREE.Vector3();

  return {
    camera: () => ({
      eye: new THREE.Vector3(0, CAMERA.height * ctx.w, ctx.heroZ + CAMERA.back * ctx.w),
      look: new THREE.Vector3(0, CAMERA.lookY * ctx.w, CAMERA.lookZ * ctx.w),
    }),
    spot: () => spot.set(laneX(lane), 0, ctx.heroZ),
    setActive() { feetY = 0; velY = 0; hurtLeft = 0; ctx.hero.fade(1); },
    update(now, dt, move) {
      const cfg = ctx.config();
      // 左右：按下的那一刻换一条道，立刻到位
      const dir = +move.press.right - +move.press.left;
      if (dir !== 0) { lane = Math.max(0, Math.min(LANES - 1, lane + dir)); ctx.hero.face(dir > 0 ? 1 : -1); }
      if ((move.jump || move.press.up) && feetY <= 0) velY = cfg.jumpVelocity;
      velY -= cfg.gravity * dt;
      feetY = Math.max(0, feetY + velY * dt);
      if (feetY <= 0) velY = 0;
      // 每个弹幕只打中一次
      for (let i = first; i < notes.length && notes[i].timeMs - now <= cfg.hitWindowMs; i++) {
        if (spent.has(i) || !struck(notes[i], lane, feetY, now, cfg.hitWindowMs, cfg.barClear)) continue;
        spent.add(i);
        ctx.score.add('miss');
        hurtLeft = HURT.ms;
      }
      // 过了那一排还没被打中的：躲过去了
      for (; judged < notes.length && now - notes[judged].timeMs > cfg.hitWindowMs; judged++) if (!spent.has(judged)) ctx.score.add('perfect', 'auto');
      hurtLeft = Math.max(0, hurtLeft - dt * 1000);
      ctx.hero.fade(hurtLeft > 0 && Math.floor(hurtLeft / HURT.flickerMs) % 2 === 0 ? HURT.alpha : 1);
      ctx.hero.place(laneX(lane), feetY, ctx.heroZ, cfg.heroScale);
      ctx.hero.castShadow(0);
    },
    draw(now) {
      orbs.begin(); bars.begin();
      while (first < notes.length && noteProgress(notes[first], now, ctx.travelMs) > SHAPE.past) first++;
      for (let i = first; i < notes.length; i++) {
        const n = notes[i], p = noteProgress(n, now, ctx.travelMs);
        if (p < 0) break;
        (n.char === '_' ? bars : orbs).put(laneX(n.lane), 0, p * ctx.heroZ);   // 从屏幕（z = 0）飞到主角那一排
      }
      orbs.end(); bars.end();
    },
    dispose() { orbs.dispose(); bars.dispose(); },
  };
});
