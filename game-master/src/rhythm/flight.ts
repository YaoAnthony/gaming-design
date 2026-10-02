// ===== 音符在路上（纯计算）=====
import type { Note } from './chart';

/** 音符飞了多少：0 = 刚出发，1 = 到主角跟前（拍点），大于 1 = 过去了 */
export const noteProgress = (note: Note, nowMs: number, travelMs: number): number => 1 - (note.timeMs - nowMs) / travelMs;

/** 长按的尾巴飞了多少（不是长按就和头一样） */
export const tailProgress = (note: Note, nowMs: number, travelMs: number): number => 1 - (note.timeMs + (note.holdMs ?? 0) - nowMs) / travelMs;

/**
 * 躲：这个弹幕现在打没打中人。到了主角那一排（前后 windowMs 以内）、在同一条道上才算；
 * 弹幕（'o'）跳起来也躲不过，横杠（'_'）脚离地够高就过去了
 */
export function struck(note: Note, lane: number, feetY: number, nowMs: number, windowMs: number, barClear: number): boolean {
  if (note.lane !== lane || Math.abs(note.timeMs - nowMs) > windowMs) return false;
  return note.char !== '_' || feetY < barClear;
}
