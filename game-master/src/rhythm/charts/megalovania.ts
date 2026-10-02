// 技术验证用的谱：Megalovania 的前 128 秒（120 BPM，第一拍在 0.15 秒；一小节 4 拍 = 2 秒，一行 = 十六分音符）。
// 编排：前面一直在 2D 画面里（喵斯快跑 → 太鼓 → 节奏大师），曲子最高潮时破屏到 3D（光剑），回落时躲弹幕收尾。
// 主旋律一小节的节奏型（十六分音符的第几个）：0 1 2 . 4 . . 7 . 9 . 11 . 13 14 15 —— 越往后的段落跟得越紧。
// 每段第一小节空着（音符提前一小节出发，换玩法、破屏也在这一小节里）。
// 曲子放在 public/local/ 下（技术验证用，曲子本身有版权，正式版要换掉）；没有这个文件时只打拍子。
import { bar, type Chart } from '../chart';

const STEPS = 16;
const rest = (lanes: number) => bar(lanes, STEPS, {});
/** 把几种小节按顺序排起来 */
const bars = (...list: string[][]): string[] => list.flat();

// ---- 喵斯快跑：两个字符，第一个是上排 ----
const d = (hits: Record<number, string>) => bar(2, STEPS, hits);
const DASH_A = d({ 0: '.x', 8: '.x' });                                   // 一小节两下，认认键
const DASH_B = d({ 0: 'x.', 8: '.x' });
const DASH_C = d({ 0: '.x', 4: '.x', 8: 'x.', 12: '.x' });               // 每拍一下
const DASH_D = d({ 0: 'x.', 4: '.x', 8: 'x.', 12: 'x.', 14: '.x' });

// ---- 太鼓：一个字符，r 红（咚）b 蓝（咔）----
const t = (hits: Record<number, string>) => bar(1, STEPS, hits);
const TAIKO_A = t({ 0: 'r', 4: 'r', 8: 'b', 12: 'r' });
const TAIKO_B = t({ 0: 'r', 4: 'b', 8: 'r', 10: 'r', 12: 'b' });
const TAIKO_C = t({ 0: 'r', 2: 'r', 4: 'b', 8: 'r', 10: 'r', 12: 'b', 14: 'b' });   // 八分音符
const TAIKO_D = t({ 0: 'r', 2: 'r', 4: 'b', 7: 'r', 9: 'r', 11: 'b', 13: 'r', 14: 'b' });   // 跟上主旋律的切分

// ---- 节奏大师：四条道 ----
const m = (hits: Record<number, string>) => bar(4, STEPS, hits);
const MANIA_A = m({ 0: 'x...', 4: '.x..', 8: '..x.', 12: '...x' });
const MANIA_B = m({ 0: 'x..x', 4: '..x.', 8: '.x..', 10: '..x.', 12: 'x...' });
const MANIA_C = m({ 0: 'x...', 2: '.x..', 4: '..x.', 7: '...x', 9: '..x.', 11: '.x..', 13: 'x...', 14: '.x..' });   // 主旋律
const MANIA_D = m({ 0: 'x..x', 2: '.x..', 4: '..x.', 7: 'x...', 9: '.x..', 11: '..x.', 13: '...x', 14: '..x.' });

// ---- 光剑：四条道，方块上的方向 ----
const s = (hits: Record<number, string>) => bar(4, STEPS, hits);
const SABER_A = s({ 0: '<...', 4: '...>', 8: '.^..', 12: '..v.' });
const SABER_B = s({ 0: '.>..', 4: '..<.', 8: '^...', 10: '...^', 12: 'v...' });
const SABER_C = s({ 0: '<...', 2: '.>..', 4: '..<.', 7: '...>', 9: '.^..', 11: '..v.', 13: '^...', 14: '...v' });   // 主旋律
const SABER_D = s({ 0: '...>', 2: '..<.', 4: '.>..', 7: '<...', 9: '..^.', 11: '.v..', 13: '...^', 14: 'v...' });

// ---- 躲：四条道，o 弹幕、_ 横杠 ----
const g = (hits: Record<number, string>) => bar(4, STEPS, hits);
const DODGE_A = g({ 0: 'oo..', 4: '..oo', 8: 'o..o', 12: '.oo.' });
const DODGE_B = g({ 0: '____', 4: 'ooo.', 8: '.ooo', 12: 'oo.o' });
const DODGE_C = g({ 0: 'o.oo', 2: 'oo.o', 4: '____', 8: 'ooo.', 10: '.ooo', 12: 'o_o_' });

export const MEGALOVANIA: Chart = {
  id: 'megalovania',
  audio: 'local/Undertale_Megalovania.mp3',
  bpm: 120,
  offsetMs: 150,
  stepsPerBeat: 4,
  sections: [
    { mode: 'dash', rows: bars(rest(2), DASH_A, DASH_B, DASH_A, DASH_C, DASH_D, DASH_C, DASH_D) },                       // 0–16 秒：安静的前奏
    { mode: 'taiko', rows: bars(rest(1), TAIKO_A, TAIKO_B, TAIKO_A, TAIKO_B, TAIKO_C, TAIKO_B, TAIKO_C,                   // 16–48 秒：渐强
      TAIKO_C, TAIKO_D, TAIKO_C, TAIKO_D, TAIKO_D, TAIKO_C, TAIKO_D, TAIKO_D) },
    { mode: 'mania', rows: bars(rest(4), MANIA_A, MANIA_B, MANIA_A, MANIA_B, MANIA_C, MANIA_B, MANIA_C,                   // 48–80 秒：高潮
      MANIA_C, MANIA_D, MANIA_C, MANIA_D, MANIA_D, MANIA_C, MANIA_D, MANIA_D) },
    { mode: 'saber', rows: bars(rest(4), SABER_A, SABER_B, SABER_A, SABER_B, SABER_C, SABER_B, SABER_C,                   // 80–112 秒：超级高潮，破屏
      SABER_C, SABER_D, SABER_C, SABER_D, SABER_D, SABER_C, SABER_D, SABER_D) },
    { mode: 'dodge', rows: bars(rest(4), DODGE_A, DODGE_B, DODGE_A, DODGE_C, DODGE_B, DODGE_C, DODGE_C) },                // 112–128 秒：回落，躲弹幕收尾
  ],
};
