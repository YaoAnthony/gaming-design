// ===== 躲：四条道，红色的高墙从屏幕里冲过来，站在它那条道上就被撞（换道躲开）；黄色的矮横杠跳过去。被撞算 Miss，躲过去算 Perfect =====
// 躲过一排会出一声、弹一次 Perfect；换道是很快地滑过去（判定按按下的那一刻算，不等滑到）。
// 主角那一排的地面会提前亮起来：哪条道亮红，下一排墙就撞哪条道，别站在上面；亮黄就是要跳
import * as THREE from 'three';
import type { Note } from '@/rhythm';
import { noteProgress, RHYTHM_MODES, struck } from '@/rhythm';
import { Colors } from '@/game/palette';
import { defineRhythmMode, NoteBoxes } from './define';

const LANES = RHYTHM_MODES.dodge.lanes;
/** 弹幕、横杠：占道宽的多少、多高、多厚（格）；过了主角那一排还飞多远才消失（进度）；同时最多画多少个；红墙多实 */
const SHAPE = { orb: { width: 0.62, height: 4.6, depth: 1 }, bar: { width: 0.96, height: 0.4, depth: 0.6 }, past: 1.25, max: 128, wallAlpha: 0.78 };
/** 换道时人滑过去用多久（毫秒，只是看着顺，判定不等它） */
const SLIDE_MS = 70;
/** 被打中后人一闪一闪多久、一亮一暗各多久（毫秒）、暗的时候多透 */
const HURT = { ms: 450, flickerMs: 70, alpha: 0.25 };
/** 镜头：在主角那一排身后多远、多高，看向哪（离地多高、离屏幕多远），都是屏幕宽的倍数。高高地俯看，四条道和整块屏幕都在画面里 */
const CAMERA = { back: 0.85, height: 0.85, lookY: 0.05, lookZ: 0.3 };
/** 地面预警：亮的那一块在主角那一排前后多深（格）；最亮多亮；墙飞到多远（进度）开始亮 */
const WARN = { depth: 5, alpha: 0.75, from: 0.35 };

defineRhythmMode('dodge', (ctx, notes) => {
  const laneW = ctx.w / LANES, laneX = (lane: number) => (lane + 0.5) * laneW - ctx.w / 2;
  const orbs = new NoteBoxes(ctx.root, SHAPE.orb.width * laneW, SHAPE.orb.height, SHAPE.orb.depth, Colors.rose, SHAPE.max);
  orbs.mesh.material.transparent = true; orbs.mesh.material.opacity = SHAPE.wallAlpha;   // 墙半透：挡不住后面的墙和人
  const bars = new NoteBoxes(ctx.root, SHAPE.bar.width * laneW, SHAPE.bar.height, SHAPE.bar.depth, Colors.gold, SHAPE.max);
  /** 站在第几条道、脚离地多高、往上的速度；打中过的弹幕；这个下标之前的都飞过去了 / 都判过了 */
  let lane = Math.floor(LANES / 2), feetY = 0, velY = 0, first = 0, judged = 0, hurtLeft = 0, shownX = laneX(Math.floor(LANES / 2)), lastRowAt = -1;
  const spent = new Set<number>();
  // 每条道在主角那一排的一块地面：下一排墙 / 横杠快到时亮起来
  const pad = new THREE.PlaneGeometry(laneW * 0.96, WARN.depth);
  const warns = Array.from({ length: LANES }, (_, i) => {
    const mesh = new THREE.Mesh(pad, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(laneX(i), 0.03, ctx.heroZ);
    mesh.visible = false;
    ctx.root.add(mesh);
    return mesh;
  });
  const spot = new THREE.Vector3();

  return {
    camera: () => ({
      eye: new THREE.Vector3(0, CAMERA.height * ctx.w, ctx.heroZ + CAMERA.back * ctx.w),
      look: new THREE.Vector3(0, CAMERA.lookY * ctx.w, CAMERA.lookZ * ctx.w),
    }),
    spot: () => spot.set(laneX(lane), 0, ctx.heroZ),
    setActive(on) { feetY = 0; velY = 0; hurtLeft = 0; ctx.hero.fade(1); warns.forEach(w => { w.visible = on; }); },
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
        ctx.hurt();
        hurtLeft = HURT.ms;
      }
      // 过了那一排还没被打中的：躲过去了
      // 一排里的第一个出声、弹字（躲过一排响一下），同一排其余的只记分
      for (; judged < notes.length && now - notes[judged].timeMs > cfg.hitWindowMs; judged++) {
        if (spent.has(judged)) continue;
        const row = notes[judged].timeMs;
        ctx.score.add('perfect', row === lastRowAt ? 'auto' : 'press');
        lastRowAt = row;
      }
      hurtLeft = Math.max(0, hurtLeft - dt * 1000);
      ctx.hero.fade(hurtLeft > 0 && Math.floor(hurtLeft / HURT.flickerMs) % 2 === 0 ? HURT.alpha : 1);
      shownX += (laneX(lane) - shownX) * (1 - Math.exp(-dt * 1000 / SLIDE_MS));
      ctx.hero.place(shownX, feetY, ctx.heroZ, cfg.heroScale);
      ctx.hero.castShadow(0);
    },
    draw(now) {
      orbs.begin(); bars.begin();
      /** 每条道上最快要到的那一个（还没过主角那一排的） */
      const next: (Note | undefined)[] = Array.from({ length: LANES });
      while (first < notes.length && noteProgress(notes[first], now, ctx.travelMs) > SHAPE.past) first++;
      for (let i = first; i < notes.length; i++) {
        const n = notes[i], p = noteProgress(n, now, ctx.travelMs);
        if (p < 0) break;
        (n.char === '_' ? bars : orbs).put(laneX(n.lane), 0, p * ctx.heroZ);   // 从屏幕（z = 0）飞到主角那一排
        if (p <= 1 && !next[n.lane]) next[n.lane] = n;
      }
      orbs.end(); bars.end();
      // 地面预警：越近越亮；红 = 墙（换道），黄 = 横杠（跳）
      warns.forEach((w, lane) => {
        const n = next[lane], p = n ? noteProgress(n, now, ctx.travelMs) : 0;
        w.material.opacity = n ? WARN.alpha * Math.max(0, (p - WARN.from) / (1 - WARN.from)) : 0;
        if (n) w.material.color.setHex(n.char === '_' ? Colors.gold : Colors.rose);
      });
    },
    dispose() { orbs.dispose(); bars.dispose(); warns.forEach(w => { w.removeFromParent(); w.material.dispose(); }); pad.dispose(); },
  };
});
