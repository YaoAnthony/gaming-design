// ===== 节奏关卡的谱面（纯数据 + 纯计算）=====
// 一张谱分成几段（Section），每段一种玩法（rhythm/modes.ts），段与段首尾相接。
// 每段按「步」写：一步 = 1 / stepsPerBeat 拍，每一步一行、每条道一个字符；'.' 是空，别的字符什么意思看那种玩法。
// 整张谱第 i 行的音符在 offsetMs + i 步 的时刻到达主角跟前。音符提前出发，所以每段开头要空出几拍（换玩法、转镜头也在这几拍里）。
import { HOLD_BODY, RHYTHM_MODES, type ModeId } from './modes';

export interface Section {
  mode: ModeId;
  rows: string[];
  /** 换到这一段之前 Game Master 在对话框里说的一句（台词的 i18n key）：上一段快结束时开始说，说到这一段开头空着的那一小节 */
  say?: string;
}

/** 开打前的开场白（台词都是 i18n key） */
export interface ChartIntro {
  /** 谁在说（i18n key）、用哪个头像（asset 的 AVATARS）；换段前的那句话（Section.say）也是他说 */
  speaker: string;
  avatar?: string;
  /** 前面这几句：玩家跳一下翻一句（这时候人照常能跳） */
  talk: string[];
  /**
   * 后面这几句跳不过去、自己往下走（人不再归玩家管）：每句至少显示 ms 毫秒（字没打完会再等等）；
   * grow = 台词用 | 分截、一截比一截大；shout = 同时砸在画面正中的一行大字（i18n key）
   */
  locked: { text: string; ms: number; grow?: boolean; shout?: string }[];
}

export interface Chart {
  id: string;
  /** 开打前说什么；不写 = 不说话，钢琴变出来就开始放板 */
  intro?: ChartIntro;
  /** 在哪一层打（层 id）：从别处开这一场会先传到那一层；不写 = 就地打 */
  arena?: string;
  /** 曲子的地址（相对站点根目录）；读不出来（文件不在）就只打拍子 */
  audio: string;
  bpm: number;
  /** 第一拍在曲子的第几毫秒 */
  offsetMs: number;
  stepsPerBeat: number;
  sections: Section[];
}

export interface Note {
  /** 到达主角跟前的时刻（曲子的第几毫秒） */
  timeMs: number;
  lane: number;
  /** 谱面上的字符：什么意思看那一段的玩法 */
  char: string;
  /** 属于第几段 */
  section: number;
  /** 长按要按住多久（毫秒）；不是长按就没有 */
  holdMs?: number;
}

/** 一步多少毫秒、一拍多少毫秒 */
export const stepMs = (c: Chart): number => 60000 / c.bpm / c.stepsPerBeat;
export const beatMs = (c: Chart): number => 60000 / c.bpm;

/** 这种玩法的音符提前多少毫秒出发：travelBeats 拍，飞得快的玩法（speed）按倍数缩短 */
export const travelMsOf = (c: Chart, mode: ModeId, travelBeats: number): number => travelBeats * beatMs(c) / RHYTHM_MODES[mode].speed;

/** sectionStarts 的结果按谱面缓存：一帧里会被问好几次（现在在第几段、结束没有） */
const startsCache = new WeakMap<Chart, readonly number[]>();

/** 每一段从曲子的第几毫秒开始；最后多一项 = 整张谱结束的时刻（谱面是定好的数据，算一次就记住） */
export function sectionStarts(c: Chart): readonly number[] {
  const hit = startsCache.get(c);
  if (hit) return hit;
  const step = stepMs(c), out = [c.offsetMs];
  for (const s of c.sections) out.push(out[out.length - 1] + s.rows.length * step);
  startsCache.set(c, out);
  return out;
}

/** 整张谱结束的时刻：撑到这就算赢 */
export const endMs = (c: Chart): number => { const s = sectionStarts(c); return s[s.length - 1]; };

/** 曲子的第 ms 毫秒在第几段（还没开始算第 0 段，结束了算最后一段） */
export function sectionAt(c: Chart, ms: number): number {
  const starts = sectionStarts(c);
  let i = 0;
  while (i < c.sections.length - 1 && ms >= starts[i + 1]) i++;
  return i;
}

/** 谱面里所有的音符，按时间排好 */
export function notesOf(c: Chart): Note[] {
  const step = stepMs(c), starts = sectionStarts(c), out: Note[] = [];
  c.sections.forEach((s, section) => s.rows.forEach((row, i) => {
    [...row].forEach((char, lane) => {
      if (char === '.' || char === HOLD_BODY) return;
      const note: Note = { timeMs: starts[section] + i * step, lane, char, section };
      // 长按的头：下面紧跟着几行 '|' 就按住几步
      if ((RHYTHM_MODES[s.mode].holds as string).includes(char)) {
        let len = 0;
        while (s.rows[i + len + 1]?.[lane] === HOLD_BODY) len++;
        if (len > 0) note.holdMs = len * step;
      }
      out.push(note);
    });
  }));
  return out;
}

/**
 * 谱面写得对不对：每行字符数对、只用那种玩法认识的字符、一行里的音符不超过那种玩法的上限、
 * 没有哪一行整排都是躲不掉的、每段都是整小节、每段开头空出了 leadBeats 拍（音符要提前这么久出发）、
 * 长按的 '|' 上面接着长按的头或者另一个 '|'、按着长按的那几步别的道上没有音符（手占着，顾不上别处）、
 * 要人自己走过去的玩法（reach）里相邻两个音符之间来得及换道
 */
export function chartErrors(c: Chart, leadBeats: number): string[] {
  const errors: string[] = [];
  c.sections.forEach((s, si) => {
    const spec = RHYTHM_MODES[s.mode], at = (i: number) => `第 ${si} 段（${s.mode}）第 ${i} 行`;
    if (s.rows.length % (c.stepsPerBeat * 4) !== 0) errors.push(`第 ${si} 段（${s.mode}）：${s.rows.length} 行，不是整小节`);
    // 要人自己走过去的玩法：上一个音符在哪条道、在第几行
    let last: { lane: number; row: number } | null = null;
    s.rows.forEach((row, i) => {
      const notes = [...row].filter(ch => ch !== '.' && ch !== HOLD_BODY);
      if (spec.reach > 0 && notes.length === 1) {
        const lane = [...row].findIndex(ch => ch !== '.' && ch !== HOLD_BODY);
        if (last && Math.abs(lane - last.lane) > (i - last.row) / c.stepsPerBeat * spec.reach) errors.push(`${at(i)}：离上一个音符隔了 ${Math.abs(lane - last.lane)} 条道，来不及换过去`);
        last = { lane, row: i };
      }
      [...row].forEach((ch, lane) => {
        const above = s.rows[i - 1]?.[lane] ?? '.';
        if (ch === HOLD_BODY && above !== HOLD_BODY && !(spec.holds as string).includes(above)) errors.push(`${at(i)}：'|' 上面要接着长按的头`);
      });
      if (row.includes(HOLD_BODY) && notes.length) errors.push(`${at(i)}：按着长按的时候别的道上不能有音符`);
      if (row.length !== spec.lanes) errors.push(`${at(i)}：要 ${spec.lanes} 个字符，写了 ${row.length} 个`);
      if (notes.some(ch => !spec.chars.includes(ch))) errors.push(`${at(i)}：有这种玩法不认识的字符（${row}）`);
      if (notes.length > spec.maxPerRow) errors.push(`${at(i)}：一行最多 ${spec.maxPerRow} 个音符`);
      if (row.length === spec.lanes && notes.length === spec.lanes && notes.every(ch => spec.blocking.includes(ch))) errors.push(`${at(i)}：整排都躲不掉`);
      if (i < leadBeats * c.stepsPerBeat && (notes.length || row.includes(HOLD_BODY))) errors.push(`${at(i)}：每段开头要空 ${leadBeats} 拍`);
    });
  });
  return errors;
}

/**
 * 拼谱面用：写一小节。hits = 第几步（从 0 数）是哪一行，没写的步是空行。
 * 比如 4 条道、一小节 16 步：bar(4, 16, { 0: 'x...', 8: '..x.' })
 */
export function bar(lanes: number, steps: number, hits: Record<number, string>): string[] {
  return Array.from({ length: steps }, (_, i) => hits[i] ?? '.'.repeat(lanes));
}

/**
 * 拼谱面用：在写好的一小节上加一个长按。从第 at 步开始在第 lane 条道上写头（head），下面 len 步写 '|'。
 * 那几步原来在别的道上有什么照样留着
 */
export function withHold(rows: string[], lane: number, at: number, len: number, head: string): string[] {
  const put = (row: string, ch: string) => row.substring(0, lane) + ch + row.substring(lane + 1);
  return rows.map((row, i) => (i === at ? put(row, head) : i > at && i <= at + len ? put(row, HOLD_BODY) : row));
}

/** 拼谱面用：把几小节（每小节是若干行）重复 times 遍 */
export const repeat = (rows: string[], times: number): string[] => Array.from({ length: times }, () => rows).flat();
