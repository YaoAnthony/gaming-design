// ===== Give It Up（2D）：小人跟着拍子在一排柱子上一格一格地跳，自己会跳；要在起跳的那一拍按空格的只有两种时候 =====
// 'u' 下一根柱子高一截：按了才跳得上去；'x' 下一根是尖刺：按一下跨过去，落在再下一根上。
// 柱子一拍一根，Game Master 弹一下琴键飞过来一根，落在右边排过来；高的柱子之后一拍降一截（往下跳不用按）。
// 该按没按：上不去高柱就撞在柱子上、跨不过尖刺就踩上去，扣一滴血，人闪一拍。
// 进场、退场是平滑的：柱子从地里升起来 / 沉回去，不是一下子冒出来。
import Phaser from 'phaser';
import { NoteTrack, type Note } from '@/rhythm';
import { Colors } from '@/shared/palette';
import { burst, defineFlatMode, JUDGE_COLOR } from './define';

/**
 * 柱子：一拍隔多远、多宽、最矮的多高、高一截是多高（格）、最多高几截；尖刺的柱子多高、刺多高（格）；
 * 普通一跳、跨过尖刺的一跳各跳多高（格）
 */
export const PILLAR = { gap: 2.6, width: 1.9, base: 0.8, step: 0.9, maxLevel: 3, spike: 0.35, spikeTip: 0.7, hop: 0.9, leap: 2.4 };
/** 柱子升起来 / 沉回去用多久（毫秒）；撞了之后人往回弹多远（格）、一亮一暗各多久（毫秒）、暗的时候多透 */
/** 柱子从 Game Master 手边飞过来：飞多远落到位（格）、弧线多高（格）、刚出手时多小 */
export const FLY = { span: 3.2, arc: 1.6, scale: 0.35 };
/** 接着引子开场时，引子没放的那些柱子补飞过来：隔多久一根、一根飞多久（毫秒） */
const FILL = { everyMs: 140, flyMs: 420 };
const RISE_MS = 700, BUMP = { back: 0.7, flickerMs: 70, alpha: 0.3 };

/**
 * 画一根柱子。slot = 落好之后的位置（x，正中），height = 落好之后多高；u = 飞到了几成（1 = 落好了）：
 * 从 from（Game Master 手边）划一道弧线落到位，边飞边长大。kind：plain 白边、note 金边（要按键的那根）、passed 绿边（踩过的）、spike 尖刺
 */
export function drawPillar(g: Phaser.GameObjects.Graphics, T: number, ground: number, slot: number, height: number, from: { x: number; y: number }, u: number, kind: 'plain' | 'note' | 'passed' | 'spike', tip = 1): void {
  const e = u * u * (3 - 2 * u), w = PILLAR.width * T;
  const x = Phaser.Math.Linear(from.x, slot, e), size = Phaser.Math.Linear(FLY.scale, 1, e);
  const bottom = Phaser.Math.Linear(from.y, ground, e) - Math.sin(Math.PI * u) * FLY.arc * T;
  const pw = w * size, ph = height * size, y = bottom - ph;
  if (kind === 'spike') {
    g.fillStyle(Colors.rose, 1); g.fillRect(x - pw / 2, y, pw, ph);
    g.fillTriangle(x - pw * 0.22, y, x + pw * 0.22, y, x, y - PILLAR.spikeTip * T * tip * size);
    return;
  }
  g.fillStyle(Colors.ink, 1); g.fillRect(x - pw / 2, y, pw, ph);
  g.lineStyle(2, Colors.dim, 1); g.strokeRect(x - pw / 2, y, pw, ph);
  g.fillStyle(kind === 'passed' ? Colors.mint : kind === 'note' ? Colors.gold : Colors.paper, 1);
  g.fillRect(x - pw / 2, y, pw, T * 0.18 * size);
}

defineFlatMode('giveup', (ctx, notes) => {
  const { scene, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const beatOf = (ms: number) => Math.round((ms - ctx.beat.offsetMs) / ctx.beat.ms);
  // 这一段的每一根柱子：高几截、是不是尖刺。从这一段的第一拍排到最后一个音符之后几拍
  // 接着引子开场（ctx.built）：主角左边已经落好的那几块也算进来，柱子不用再从地里升
  const built = ctx.built, builtAt = scene.time.now;
  const first = (notes.length ? Math.min(0, beatOf(notes[0].timeMs)) : 0) - (built?.left ?? 0);
  const noteAt = new Map<number, Note>(notes.map(n => [beatOf(n.timeMs), n]));
  const last = (notes.length ? beatOf(notes[notes.length - 1].timeMs) : 0) + 8;
  const level = new Map<number, number>(), spike = new Set<number>();
  for (let k = first, h = 0; k <= last; k++) {
    level.set(k, h);
    const n = noteAt.get(k);
    if (n?.char === 'x') spike.add(k + 1);
    h = n?.char === 'u' ? Math.min(PILLAR.maxLevel, h + 1) : Math.max(0, h - 1);   // 没按键的时候一拍降一截
  }
  /** 柱子升起来了几成（0 = 全在地里，1 = 全出来了）：轮到时升、轮完沉 */
  let risen = built ? 1 : 0, rising = false, lastAt = scene.time.now;
  const top = (k: number) => ctx.ground - (spike.has(k) ? PILLAR.spike : PILLAR.base + (level.get(k) ?? 0) * PILLAR.step) * T * risen * risen * (3 - 2 * risen);
  const pillars = scene.add.graphics().setDepth(ctx.depth);
  /** 撞了的那一下是曲子的第几毫秒（人闪一拍） */
  let bumpAt = -Infinity;

  return {
    setActive(on) { rising = on; ctx.hero.setAlpha(1); if (on) ctx.hero.setFlipX(false); },
    update(now, press) {
      const w = ctx.config().windows;
      if (press.jump || press.up) {
        ctx.boom();   // 跳：和平时起跳一样的那一声爆炸
        const hit = track.press(now, w, () => true);
        if (hit) { burst(scene, ctx.hero.x, ctx.hero.y, T, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
      }
      if (track.sweep(now, w).length) { burst(scene, ctx.hero.x, ctx.hero.y, T, JUDGE_COLOR.miss, ctx.depth + 2); bumpAt = now; ctx.hurt(); }
      // 人在哪：从这一拍踩的柱子跳到下一根；下一根是尖刺就一步跨到再下一根（正在跨的那一拍也一样）
      const beats = Math.max(0, (now - ctx.beat.offsetMs) / ctx.beat.ms), k = Math.floor(beats);   // 第一拍之前站在第一根上等着
      const from = spike.has(k) ? k - 1 : k, to = spike.has(from + 1) ? from + 2 : from + 1;
      const t = Phaser.Math.Clamp((beats - from) / (to - from), 0, 1);
      const y = Phaser.Math.Linear(top(from), top(to), t) - Math.sin(Math.PI * t) * (to - from > 1 ? PILLAR.leap : PILLAR.hop) * T;
      // 撞了：往回弹一下再回来，闪一拍
      const bump = (now - bumpAt) / ctx.beat.ms, bumped = bump >= 0 && bump < 1;
      ctx.hero.setPosition(ctx.heroX - (bumped ? Math.sin(Math.PI * bump) * BUMP.back * T : 0), y - ctx.hero.displayHeight / 2);
      ctx.hero.setAlpha(bumped && Math.floor((now - bumpAt) / BUMP.flickerMs) % 2 === 0 ? BUMP.alpha : 1);
    },
    draw(now) {
      // 升 / 沉：按真实时间走（和曲子的时间无关：曲子还没响的时候也要能升起来）
      const real = scene.time.now, step = (real - lastAt) / RISE_MS;
      lastAt = real;
      risen = Phaser.Math.Clamp(risen + (rising ? step : -step), 0, 1);
      pillars.clear();
      if (risen <= 0) return;
      const beats = Math.max(0, (now - ctx.beat.offsetMs) / ctx.beat.ms), gap = PILLAR.gap * T;
      for (let k = Math.max(first, Math.floor(beats) - 3); k <= last; k++) {
        const slot = ctx.heroX + (k - beats) * gap;
        if (slot > ctx.source.x) break;   // 还没轮到：Game Master 还没把它弹出来
        const height = ctx.ground - top(k);
        if (height < 1) continue;
        // 刚弹出来的那一段路是飞过来的；接着引子开场时，引子没放的那些一根接一根补飞过来
        const scrolled = Phaser.Math.Clamp((ctx.source.x - slot) / (FLY.span * T), 0, 1);
        const filled = built && k > built.right ? Phaser.Math.Clamp((real - builtAt - (k - built.right - 1) * FILL.everyMs) / FILL.flyMs, 0, 1) : 1;
        const u = Math.min(scrolled, filled);
        if (u <= 0) continue;
        drawPillar(pillars, T, ctx.ground, slot, height, ctx.boss, u, spike.has(k) ? 'spike' : k < beats - 0.5 ? 'passed' : noteAt.has(k) ? 'note' : 'plain', risen);
      }
    },
    destroy() { pillars.destroy(); },
  };
});
