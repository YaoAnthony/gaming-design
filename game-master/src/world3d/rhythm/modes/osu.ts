// ===== osu!（3D，像 QTE）：圈悬在半空，外面一圈大环往里缩，缩到和圈重合的那一刻按圈上写的键，人飞过去把它点掉 =====
// 圈不飞：到点之前一段时间出现在原地，看环缩。四列从左到右是 Q W E R，谱面上的数字是圈悬多高。
// 长按的圈（谱面上的 a b c）：点中之后别松手，圈里面有一圈亮环慢慢缩，缩完了才算按完；提前松手算漏。
// 滑条（A B C 往右、x y z 往左）：也是按住不放，圈带着人沿着一条轨道滑到隔壁那一列，滑到头才松手。
import * as THREE from 'three';
import { LANE_KEYS, noteProgress, NoteTrack, RHYTHM_MODES, tailProgress, type Note } from '@/rhythm';
import { Colors, hex } from '@/game/palette';
import { Bursts, defineRhythmMode, letterTexture } from './define';

const LANES = RHYTHM_MODES.osu.lanes;
/**
 * 圈的直径（格）；谱面上 1 / 2 / 3 悬多高（圈心离地，格）；环一开始是圈的几倍大；
 * 圈刚出现时从几成大弹出来、在进度的前多少里弹完；过了拍点还留多久（进度）；同时最多画多少个
 */
const CIRCLE = { size: 3.2, heights: [2.4, 5.6, 8.8], approach: 3.2, popFrom: 0.5, popOver: 0.15, past: 1.12, max: 32 };
/** 镜头：正对着人那一排，从前面平着看（屏幕宽的倍数）；屏幕（骷髅王）在后面当背景 */
const CAMERA = { back: 0.85, height: 0.2, lookY: 0.19 };
/** 每一列圈的颜色；圈上的字的贴图 */
const TINT = [Colors.rose, Colors.gold, Colors.mint, Colors.sky], LABEL = { px: 128, font: 0.56 };
/** 击中反馈：炸开多久（毫秒）、放大到几倍；漏了人闪多久、多透；每种判定炸什么颜色 */
const FEEL = { burstMs: 240, burstGrow: 2, missMs: 220, missAlpha: 0.35, color: { perfect: Colors.gold, good: Colors.sky, miss: Colors.rose } };

defineRhythmMode('osu', (ctx, notes) => {
  const laneW = ctx.w / LANES, laneX = (lane: number) => (lane + 0.5) * laneW - ctx.w / 2;
  /** 谱面上 1 2 3 是点一下的圈，a b c 是长按的圈，A B C / x y z 是往右 / 往左的滑条：都是低、中、高 */
  const heightOf = (char: string) => CIRCLE.heights[['1aAx', '2bBy', '3cCz'].findIndex(set => set.includes(char))] ?? CIRCLE.heights[0];
  /** 滑条往哪边滑（+1 右，-1 左）；不是滑条是 0 */
  const slideOf = (char: string) => ('ABC'.includes(char) ? 1 : 'xyz'.includes(char) ? -1 : 0);
  /** 这个音符的圈现在在哪（滑条被按着的时候圈在滑；别的都在原地） */
  const xOf = (n: Note, now: number, holding: boolean) => {
    const from = laneX(n.lane), slide = slideOf(n.char);
    if (!slide || !holding || !n.holdMs) return from;
    const to = laneX(Math.max(0, Math.min(LANES - 1, n.lane + slide)));
    return from + (to - from) * Math.max(0, Math.min(1, (now - n.timeMs) / n.holdMs));
  };
  const track = new NoteTrack(notes, ctx.score);
  const plane = new THREE.PlaneGeometry(1, 1), ringGeo = new THREE.RingGeometry(0.46, 0.5, 48);
  const disposables: { dispose(): void }[] = [plane, ringGeo];
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geo, mat, CIRCLE.max);
    mesh.count = 0; mesh.frustumCulled = false;
    ctx.root.add(mesh);
    disposables.push(mat);
    return mesh;
  };
  // 每一列：一批圈（底色 + 那一列的键）和一批往里缩的环
  const columns = LANE_KEYS.map((k, lane) => {
    const map = letterTexture(k.label, hex(Colors.ink), { ...LABEL, disc: { fill: hex(TINT[lane]), edge: hex(Colors.paper) } });
    disposables.push(map);
    return {
      discs: instanced(plane, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false })),
      rings: instanced(ringGeo, new THREE.MeshBasicMaterial({ color: TINT[lane], transparent: true, depthWrite: false, side: THREE.DoubleSide })),
      // 长按的圈里面那一圈：按住的时候慢慢缩
      holds: instanced(ringGeo, new THREE.MeshBasicMaterial({ color: Colors.paper, transparent: true, depthWrite: false, side: THREE.DoubleSide })),
      // 滑条的轨道：一条横杠，从圈铺到隔壁那一列
      rails: instanced(plane, new THREE.MeshBasicMaterial({ color: TINT[lane], transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })),
    };
  });
  const bursts = new Bursts(ctx.root, FEEL.burstMs, FEEL.burstGrow, 8, new THREE.RingGeometry(0.38, 0.5, 48));   // 点中：一个环荡开
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const spot = new THREE.Vector3(0, 0, ctx.heroZ);
  /** 人在哪（脚底中心）、往上的速度；漏了还要闪多久；这个下标之前的圈都过去了 */
  let x = 0, feetY = 0, velY = 0, missLeft = 0, first = 0;

  return {
    camera: () => ({
      eye: new THREE.Vector3(0, CAMERA.height * ctx.w, ctx.heroZ + CAMERA.back * ctx.w),
      look: new THREE.Vector3(0, CAMERA.lookY * ctx.w, ctx.heroZ),
    }),
    spot: () => spot,
    setActive() { x = 0; feetY = 0; velY = 0; missLeft = 0; ctx.hero.fade(1); bursts.clear(); },
    update(now, dt, move) {
      const cfg = ctx.config();
      move.press.lanes.forEach((down, lane) => {
        if (!down) return;
        const hit = track.press(now, cfg.windows, n => n.lane === lane);
        if (!hit) return;
        // 点中：人一下飞到圈那（脚踩在圈底），圈原地炸开；之后人自己落回地面
        const cy = heightOf(hit.note.char);
        ctx.hero.face(laneX(lane) >= x ? 1 : -1);
        x = laneX(lane); feetY = cy - CIRCLE.size / 2; velY = 0;
        bursts.spawn(x, cy, ctx.heroZ, CIRCLE.size, FEEL.color[hit.judgement]);
      });
      // 长按：按住的时候人挂在圈上不往下掉；按完再炸一下，提前松手闪一下
      const holds = track.holds(now, cfg.windows, n => move.lanesHeld[n.lane]);
      for (const n of holds.kept) bursts.spawn(xOf(n, now, true), heightOf(n.char), ctx.heroZ, CIRCLE.size, FEEL.color.perfect);   // 滑条在滑到头的地方炸
      if (holds.dropped.length) missLeft = FEEL.missMs;
      if (track.holding.length) { const n = track.holding[track.holding.length - 1]; x = xOf(n, now, true); feetY = heightOf(n.char) - CIRCLE.size / 2; velY = 0; }
      if (track.sweep(now, cfg.windows).length) missLeft = FEEL.missMs;
      missLeft = Math.max(0, missLeft - dt * 1000);
      velY -= cfg.gravity * dt;
      feetY = Math.max(0, feetY + velY * dt);
      if (feetY <= 0) velY = 0;
      bursts.update(dt * 1000);
      ctx.hero.place(x, feetY, ctx.heroZ, cfg.heroScale);
      ctx.hero.fade(missLeft > 0 ? FEEL.missAlpha : 1);
      ctx.hero.castShadow(0);
    },
    draw(now) {
      const counts = columns.map(() => 0), holdCounts = columns.map(() => 0), railCounts = columns.map(() => 0);
      while (first < notes.length && tailProgress(notes[first], now, ctx.travelMs) > CIRCLE.past) first++;
      for (let i = first; i < notes.length; i++) {
        const note = notes[i], p = noteProgress(note, now, ctx.travelMs);
        if (p < 0) break;
        const n = counts[note.lane], holding = track.holding.includes(note);
        if ((track.done.has(i) && !holding) || n >= CIRCLE.max) continue;   // 点掉的不画了（正按着的长按还画着）
        const col = columns[note.lane];
        // 滑条的轨道：从出发的那一列铺到隔壁那一列（画在圈后面一点）
        const slide = slideOf(note.char);
        if (slide && note.holdMs) {
          const a = laneX(note.lane), b = laneX(Math.max(0, Math.min(LANES - 1, note.lane + slide)));
          pos.set((a + b) / 2, heightOf(note.char), ctx.heroZ - 0.05);
          col.rails.setMatrixAt(railCounts[note.lane]++, m.compose(pos, q, scale.set(Math.abs(b - a) + CIRCLE.size * 0.5, CIRCLE.size * 0.5, 1)));
        }
        pos.set(xOf(note, now, holding), heightOf(note.char), ctx.heroZ);
        // 长按的圈：里面一圈亮环，从圈那么大缩到中心，缩完就是按够了
        if (note.holdMs) {
          const left = Math.max(0, Math.min(1, (note.timeMs + note.holdMs - now) / note.holdMs)), inner = CIRCLE.size * 0.86 * left;
          col.holds.setMatrixAt(holdCounts[note.lane]++, m.compose(pos, q, scale.set(inner, inner, 1)));
        }
        // 圈：刚出现时弹一下出来
        const pop = CIRCLE.size * (CIRCLE.popFrom + (1 - CIRCLE.popFrom) * Math.min(1, p / CIRCLE.popOver));
        col.discs.setMatrixAt(n, m.compose(pos, q, scale.set(pop, pop, 1)));
        // 环：从大往里缩，拍点上正好和圈一样大
        const ring = CIRCLE.size * (1 + (CIRCLE.approach - 1) * Math.max(0, 1 - p));
        col.rings.setMatrixAt(n, m.compose(pos, q, scale.set(ring, ring, 1)));
        counts[note.lane] = n + 1;
      }
      columns.forEach((c, k) => {
        c.discs.count = c.rings.count = counts[k]; c.holds.count = holdCounts[k]; c.rails.count = railCounts[k];
        [c.discs, c.rings, c.holds, c.rails].forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      });
    },
    dispose() {
      bursts.dispose();
      columns.forEach(c => [c.discs, c.rings, c.holds, c.rails].forEach(mesh => { mesh.removeFromParent(); mesh.dispose(); }));
      disposables.forEach(d => d.dispose());
    },
  };
});
