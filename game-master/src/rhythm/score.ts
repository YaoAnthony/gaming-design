// ===== 判定和计分（纯计算）：2D、3D 的玩法共用 =====
import type { Note } from './chart';

export type Judgement = 'perfect' | 'good' | 'miss';
/** 时间窗（毫秒）：离拍点这么近以内算 Perfect / Good，再远不算打中 */
export interface Windows { perfect: number; good: number }

/** 一个音符最多多少分（Perfect）；Good 多少分 */
export const POINTS: Record<Judgement, number> = { perfect: 100, good: 60, miss: 0 };

/** 按下的时刻离拍点差 deltaMs：算什么；太远不算打中（null） */
export function judge(deltaMs: number, w: Windows): 'perfect' | 'good' | null {
  const d = Math.abs(deltaMs);
  return d <= w.perfect ? 'perfect' : d <= w.good ? 'good' : null;
}

export type JudgedBy = 'press' | 'auto';

/** 一场的成绩 */
export class Scoreboard {
  perfect = 0;
  good = 0;
  miss = 0;
  combo = 0;
  maxCombo = 0;
  points = 0;
  /** 最近一次判定（HUD 上闪一下） */
  last: Judgement | null = null;
  private readonly listeners: ((j: Judgement, by: JudgedBy) => void)[] = [];

  /** @param total 整张谱一共多少个音符 */
  constructor(readonly total: number) {}

  /** 每次判定都告诉它（HUD、打击音） */
  listen(fn: (j: Judgement, by: JudgedBy) => void): void { this.listeners.push(fn); }

  /** by：press = 玩家按出来的（或者该按没按漏掉的）；auto = 自动判的（躲过去的弹幕），不出声、不弹字 */
  add(j: Judgement, by: JudgedBy = 'press'): void {
    this[j]++;
    this.combo = j === 'miss' ? 0 : this.combo + 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.points += POINTS[j];
    this.last = j;
    this.listeners.forEach(fn => fn(j, by));
  }

  /** 拿到了满分的几成（0..1）：过不过关看它 */
  get ratio(): number { return this.total > 0 ? this.points / (this.total * POINTS.perfect) : 1; }
}

/** 要按键打的玩法：记着一段里哪些音符已经打掉 / 漏掉了，判定记到成绩里 */
export class NoteTrack {
  /** 处理过的（打中或漏掉）：不再画、不再判 */
  readonly done = new Set<number>();
  /** 这个下标之前的都处理过了 */
  private first = 0;

  constructor(readonly notes: readonly Note[], private readonly board: Scoreboard) {}

  /**
   * 按了一下：在时间窗里找一个还没处理、又对得上（match）的音符，离现在最近的那个算打中。
   * 返回判定和打中的那个音符；没有对得上的返回 null（空按不罚）
   */
  press(nowMs: number, w: Windows, match: (n: Note) => boolean): { judgement: Judgement; note: Note } | null {
    let best = -1;
    for (let i = this.first; i < this.notes.length && this.notes[i].timeMs - nowMs <= w.good; i++) {
      const n = this.notes[i];
      if (this.done.has(i) || nowMs - n.timeMs > w.good || !match(n)) continue;
      if (best < 0 || Math.abs(n.timeMs - nowMs) < Math.abs(this.notes[best].timeMs - nowMs)) best = i;
    }
    const j = best < 0 ? null : judge(this.notes[best].timeMs - nowMs, w);
    if (!j) return null;
    this.done.add(best);
    this.board.add(j);
    return { judgement: j, note: this.notes[best] };
  }

  /** 过了时间窗还没打的算漏：返回这次新漏的那些 */
  sweep(nowMs: number, w: Windows): Note[] {
    const missed: Note[] = [];
    while (this.first < this.notes.length && nowMs - this.notes[this.first].timeMs > w.good) {
      if (!this.done.has(this.first)) { this.done.add(this.first); this.board.add('miss'); missed.push(this.notes[this.first]); }
      this.first++;
    }
    return missed;
  }
}
