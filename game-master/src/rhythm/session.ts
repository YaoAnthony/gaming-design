// ===== 正在进行的节奏关卡：2D 的骷髅王和 3D 的大道共用这一份（谱面 + 指挥 + 成绩，还有几个两边互相叫的口子）=====
import type { Chart, Note } from './chart';
import { notesOf } from './chart';
import { Conductor } from './Conductor';
import { Scoreboard } from './score';

export interface RhythmSession {
  chart: Chart;
  notes: Note[];
  conductor: Conductor;
  score: Scoreboard;
  /** 骷髅王在画面上的哪（比例坐标 0..1，左上角是原点）：3D 里砍回去的方块往那飞。主持的一侧开场时填 */
  boss: { x: number; y: number };
  /** 主角挨了一下（撞墙、被弹幕打中）：扣血。主持的一侧开场时接上 */
  hurt: () => void;
  /** 骷髅王挨了一下（砍回去的方块砸到他）：缩一下。主持的一侧开场时接上 */
  bossHit: () => void;
  /** 出一声「起跳爆炸」（Give It Up 的跳、光剑的砍用的就是平时起跳的那一声）。主持的一侧开场时接上 */
  boom: () => void;
}

let current: RhythmSession | null = null;

export const rhythmSession = (): RhythmSession | null => current;

/** 开一场（已经有一场在进行就返回 null）。audioUrl = 曲子的完整地址 */
export function beginRhythm(chart: Chart, audioUrl: string, volume: number): RhythmSession | null {
  if (current) return null;
  const notes = notesOf(chart);
  current = {
    chart, notes, conductor: new Conductor(chart, audioUrl, volume),
    score: new Scoreboard(notes.length + notes.filter(n => n.holdMs).length),   // 长按算两下：头和尾巴
    boss: { x: 0.5, y: 0.5 }, hurt: () => {}, bossHit: () => {}, boom: () => {},
  };
  return current;
}

/** 收场。fadeMs > 0：曲子慢慢小下去再停 */
export function endRhythm(fadeMs = 0): void {
  current?.conductor.stop(fadeMs);
  current = null;
}
