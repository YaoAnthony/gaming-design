// ===== 节奏关卡的谱面（纯数据 + 纯计算）=====
// 一张谱分成几段（Section），每段一种玩法（rhythm/modes.ts），段与段首尾相接。
// 每段按「步」写：一步 = 1 / stepsPerBeat 拍，每一步一行、每条道一个字符；'.' 是空，别的字符什么意思看那种玩法。
// 整张谱第 i 行的音符在 offsetMs + i 步 的时刻到达主角跟前。音符提前出发，所以每段开头要空出几拍（换玩法、转镜头也在这几拍里）。
import { RHYTHM_MODES, type ModeId } from './modes';

export interface Section {
  mode: ModeId;
  rows: string[];
}

export interface Chart {
  id: string;
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
}

/** 一步多少毫秒、一拍多少毫秒 */
export const stepMs = (c: Chart): number => 60000 / c.bpm / c.stepsPerBeat;
export const beatMs = (c: Chart): number => 60000 / c.bpm;

/** 每一段从曲子的第几毫秒开始；最后多一项 = 整张谱结束的时刻 */
export function sectionStarts(c: Chart): number[] {
  const step = stepMs(c), out = [c.offsetMs];
  for (const s of c.sections) out.push(out[out.length - 1] + s.rows.length * step);
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
    [...row].forEach((char, lane) => { if (char !== '.') out.push({ timeMs: starts[section] + i * step, lane, char, section }); });
  }));
  return out;
}

/**
 * 谱面写得对不对：每行字符数对、只用那种玩法认识的字符、一行里的音符不超过那种玩法的上限、
 * 没有哪一行整排都是躲不掉的、每段都是整小节、每段开头空出了 leadBeats 拍（音符要提前这么久出发）
 */
export function chartErrors(c: Chart, leadBeats: number): string[] {
  const errors: string[] = [];
  c.sections.forEach((s, si) => {
    const spec = RHYTHM_MODES[s.mode], at = (i: number) => `第 ${si} 段（${s.mode}）第 ${i} 行`;
    if (s.rows.length % (c.stepsPerBeat * 4) !== 0) errors.push(`第 ${si} 段（${s.mode}）：${s.rows.length} 行，不是整小节`);
    s.rows.forEach((row, i) => {
      const notes = [...row].filter(ch => ch !== '.');
      if (row.length !== spec.lanes) errors.push(`${at(i)}：要 ${spec.lanes} 个字符，写了 ${row.length} 个`);
      if (notes.some(ch => !spec.chars.includes(ch))) errors.push(`${at(i)}：有这种玩法不认识的字符（${row}）`);
      if (notes.length > spec.maxPerRow) errors.push(`${at(i)}：一行最多 ${spec.maxPerRow} 个音符`);
      if (row.length === spec.lanes && notes.length === spec.lanes && notes.every(ch => spec.blocking.includes(ch))) errors.push(`${at(i)}：整排都躲不掉`);
      if (i < leadBeats * c.stepsPerBeat && notes.length) errors.push(`${at(i)}：每段开头要空 ${leadBeats} 拍`);
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

/** 拼谱面用：把几小节（每小节是若干行）重复 times 遍 */
export const repeat = (rows: string[], times: number): string[] => Array.from({ length: times }, () => rows).flat();
