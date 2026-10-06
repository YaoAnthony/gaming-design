// ===== 实时谱面（开发工具）：一条跟着曲子走的时间线。上面是谱面里的音符（按道分行），下面一行是你刚才按的键 =====
// 中间偏左那条竖线是「现在」：音符从右边过来，到线上就是该按的时候；按键记在按下的那一刻，和音符对不对得上一眼能看出来。
// 点时间线上的任何位置 = 从那一刻重新开始。
import { useEffect, useRef } from 'react';
import { beatMs, notesOf, RHYTHM_MODES, rhythmSession, sectionStarts, type Chart } from '@/rhythm';
import { keyName, type KeyPress } from './modeKeys';

/** 画多高（像素）；一秒多宽（像素）；「现在」那条线在左起几成的位置；顶上写字的那一条、底下按键的那一行各多高 */
const VIEW = { height: 132, pxPerSec: 150, playhead: 0.3, top: 18, bottom: 26 };
const COLOR = { bg: '#0b0b14', grid: '#232a48', bar: '#3a4370', text: '#8b93b8', section: '#ffd166', note: '#4cc9f0', hold: '#2f7f99', alt: '#ef476f', press: '#80ed99', now: '#ffffff' };
/** 这些字符画成另一种颜色（太鼓的蓝、尖刺、黄杠……）：和同一段里的普通音符分开 */
const ALT_CHARS = 'bx_';

interface Props {
  chart: Chart;
  /** 这次试玩里按过的键（引用：每帧直接读，不触发重画） */
  presses: { current: KeyPress[] };
  /** 没在打的时候时间线停在哪（毫秒） */
  idleMs: number;
  /** 每种玩法显示成什么名字 */
  modeName: (mode: string) => string;
  onSeek(ms: number): void;
}

export function ChartTimeline({ chart, presses, idleMs, modeName, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nowRef = useRef(idleMs);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const notes = notesOf(chart), starts = sectionStarts(chart), beat = beatMs(chart);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = VIEW.height;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const session = rhythmSession(), now = nowRef.current = session ? session.conductor.timeMs() : idleMs;
      const px = VIEW.pxPerSec / 1000, x0 = w * VIEW.playhead, xOf = (ms: number) => x0 + (ms - now) * px;
      const from = now - x0 / px, to = now + (w - x0) / px;
      ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, w, h);
      // 拍线（小节头粗一点，写上第几小节）
      ctx.font = '10px monospace'; ctx.textBaseline = 'top';
      for (let b = Math.max(0, Math.floor((from - chart.offsetMs) / beat)); chart.offsetMs + b * beat <= to; b++) {
        const x = xOf(chart.offsetMs + b * beat), head = b % 4 === 0;
        ctx.fillStyle = head ? COLOR.bar : COLOR.grid; ctx.fillRect(x, VIEW.top, head ? 2 : 1, h - VIEW.top);
        if (head) { ctx.fillStyle = COLOR.text; ctx.fillText(String(b / 4 + 1), x + 4, VIEW.top + 2); }
      }
      // 每一段从哪开始、是什么玩法
      starts.slice(0, chart.sections.length).forEach((ms, i) => {
        const x = xOf(ms);
        if (x < -200 || x > w) return;
        ctx.fillStyle = COLOR.section; ctx.fillRect(x, 0, 2, h);
        ctx.font = 'bold 11px sans-serif'; ctx.fillText(modeName(chart.sections[i].mode), x + 6, 3);
      });
      // 音符：这一段有几条道就分几行；长按画出它按多久
      const rows = h - VIEW.top - VIEW.bottom;
      for (const n of notes) {
        const end = n.timeMs + (n.holdMs ?? 0);
        if (end < from - 100 || n.timeMs > to) continue;
        const lanes = RHYTHM_MODES[chart.sections[n.section].mode].lanes, rowH = rows / lanes, size = Math.min(14, rowH - 4);
        const x = xOf(n.timeMs), y = VIEW.top + (n.lane + 0.5) * rowH;
        if (n.holdMs) { ctx.fillStyle = COLOR.hold; ctx.fillRect(x, y - size / 4, n.holdMs * px, size / 2); }
        ctx.fillStyle = ALT_CHARS.includes(n.char) ? COLOR.alt : COLOR.note;
        ctx.globalAlpha = n.timeMs < now ? 0.45 : 1;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
      // 按过的键：按下的那一刻一道线 + 键名；按住的画出按了多久
      ctx.font = 'bold 11px monospace'; ctx.textBaseline = 'middle';
      const py = h - VIEW.bottom / 2;
      for (const p of presses.current) {
        if (p.ms < from - 200 || p.ms > to) continue;
        const x = xOf(p.ms);
        ctx.fillStyle = COLOR.press;
        if (p.upMs && p.upMs - p.ms > 150) ctx.fillRect(x, py + 8, (p.upMs - p.ms) * px, 2);
        ctx.fillRect(x - 1, VIEW.top, 2, h - VIEW.top - VIEW.bottom + 4);
        ctx.fillText(keyName(p.code), x + 3, py);
      }
      ctx.fillStyle = COLOR.now; ctx.fillRect(x0 - 1, 0, 2, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chart, presses, idleMs, modeName]);

  return (
    <canvas ref={ref} className="lab-timeline" style={{ height: VIEW.height }} title="点这里 = 从那一刻开始"
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(nowRef.current + (e.clientX - r.left - r.width * VIEW.playhead) / (VIEW.pxPerSec / 1000));
      }} />
  );
}
