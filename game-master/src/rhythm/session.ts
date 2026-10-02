// ===== 正在进行的节奏关卡：2D 的骷髅王和 3D 的四条道共用这一份（谱面 + 指挥）=====
import type { Chart, Note } from './chart';
import { notesOf } from './chart';
import { Conductor } from './Conductor';
import { Scoreboard } from './score';

export interface RhythmSession {
  chart: Chart;
  notes: Note[];
  conductor: Conductor;
  score: Scoreboard;
}

let current: RhythmSession | null = null;

export const rhythmSession = (): RhythmSession | null => current;

/** 开一场（已经有一场在进行就返回 null）。audioUrl = 曲子的完整地址 */
export function beginRhythm(chart: Chart, audioUrl: string, volume: number): RhythmSession | null {
  if (current) return null;
  const notes = notesOf(chart);
  current = { chart, notes, conductor: new Conductor(chart, audioUrl, volume), score: new Scoreboard(notes.length) };
  return current;
}

export function endRhythm(): void {
  current?.conductor.stop();
  current = null;
}
