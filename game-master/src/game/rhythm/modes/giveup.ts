// ===== Give It Up（2D）：小人跟着拍子在一排柱子上一格一格地跳，自己会跳；要在起跳的那一拍按空格的只有两种时候 =====
// 'u' 下一根柱子高一截：按了才跳得上去；'x' 下一根是尖刺：按一下跨过去，落在再下一根上。
// 柱子一拍一根，从右边骷髅王那边排过来；高的柱子之后一拍降一截（往下跳不用按）。
import Phaser from 'phaser';
import { NoteTrack, type Note } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR } from './define';

/**
 * 柱子：一拍隔多远、多宽、最矮的多高、高一截是多高（格）、最多高几截；尖刺的柱子多高、刺多高（格）；
 * 普通一跳、跨过尖刺的一跳各跳多高（格）
 */
const PILLAR = { gap: 2.6, width: 1.9, base: 0.8, step: 0.9, maxLevel: 3, spike: 0.35, spikeTip: 0.7, hop: 0.9, leap: 2.4 };

defineFlatMode('giveup', (ctx, notes) => {
  const { scene, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const beatOf = (ms: number) => Math.round((ms - ctx.beat.offsetMs) / ctx.beat.ms);
  // 这一段的每一根柱子：高几截、是不是尖刺。从这一段的第一拍排到最后一个音符之后几拍
  const first = notes.length ? Math.min(0, beatOf(notes[0].timeMs)) : 0;
  const noteAt = new Map<number, Note>(notes.map(n => [beatOf(n.timeMs), n]));
  const last = (notes.length ? beatOf(notes[notes.length - 1].timeMs) : 0) + 8;
  const level = new Map<number, number>(), spike = new Set<number>();
  for (let k = first, h = 0; k <= last; k++) {
    level.set(k, h);
    const n = noteAt.get(k);
    if (n?.char === 'x') spike.add(k + 1);
    h = n?.char === 'u' ? Math.min(PILLAR.maxLevel, h + 1) : Math.max(0, h - 1);   // 没按键的时候一拍降一截
  }
  const top = (k: number) => ctx.ground - (spike.has(k) ? PILLAR.spike : PILLAR.base + (level.get(k) ?? 0) * PILLAR.step) * T;
  const pillars = scene.add.graphics().setDepth(ctx.depth).setVisible(false);

  return {
    setActive(on) { pillars.setVisible(on); if (on) ctx.hero.setFlipX(false); },
    update(now, press) {
      const w = ctx.config().windows;
      if (press.jump || press.up) {
        const hit = track.press(now, w, () => true);
        if (hit) { burst(scene, ctx.hero.x, ctx.hero.y, T, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
      }
      if (track.sweep(now, w).length) burst(scene, ctx.hero.x, ctx.hero.y, T, JUDGE_COLOR.miss, ctx.depth + 2);
      // 人在哪：从这一拍踩的柱子跳到下一根；下一根是尖刺就一步跨到再下一根（正在跨的那一拍也一样）
      const beats = (now - ctx.beat.offsetMs) / ctx.beat.ms, k = Math.floor(beats);
      const from = spike.has(k) ? k - 1 : k, to = spike.has(from + 1) ? from + 2 : from + 1;
      const t = Phaser.Math.Clamp((beats - from) / (to - from), 0, 1);
      const y = Phaser.Math.Linear(top(from), top(to), t) - Math.sin(Math.PI * t) * (to - from > 1 ? PILLAR.leap : PILLAR.hop) * T;
      ctx.hero.setPosition(ctx.heroX, y - ctx.hero.displayHeight / 2);
    },
    draw(now) {
      pillars.clear();
      const beats = (now - ctx.beat.offsetMs) / ctx.beat.ms, gap = PILLAR.gap * T, w = PILLAR.width * T;
      for (let k = Math.max(first, Math.floor(beats) - 3); k <= last; k++) {
        const x = ctx.heroX + (k - beats) * gap;
        if (x > ctx.source.x) break;   // 还在钢琴后面
        const y = top(k), passed = k < beats - 0.5;
        if (spike.has(k)) {
          pillars.fillStyle(Colors.rose, 1); pillars.fillRect(x - w / 2, y, w, ctx.ground - y);
          pillars.fillTriangle(x - w * 0.22, y, x + w * 0.22, y, x, y - PILLAR.spikeTip * T);
          continue;
        }
        pillars.fillStyle(Colors.ink, 1); pillars.fillRect(x - w / 2, y, w, ctx.ground - y);
        pillars.lineStyle(2, Colors.dim, 1); pillars.strokeRect(x - w / 2, y, w, ctx.ground - y);
        // 柱子顶上一道亮边：踩过的变绿；要按空格才上得去 / 跨得过的那一根（起跳的那根）标成金色
        pillars.fillStyle(passed ? Colors.mint : noteAt.has(k) ? Colors.gold : Colors.paper, 1);
        pillars.fillRect(x - w / 2, y, w, T * 0.18);
      }
    },
    destroy() { pillars.destroy(); },
  };
});
