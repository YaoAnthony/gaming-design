// 技术验证用的谱：Megalovania 的前 128 秒（120 BPM，第一拍在 0.15 秒；一小节 4 拍 = 2 秒，一行 = 十六分音符）。
// 编排：前面一直在 2D 画面里（Give It Up → 喵斯快跑 → 太鼓 → 节奏大师），1:04 破屏到 3D（osu! 点圈 → 光剑），最后躲弹幕收尾。
// 主旋律一小节的节奏型（十六分音符的第几个）：0 1 2 . 4 . . 7 . 9 . 11 . 13 14 15 —— 越往后的段落跟得越紧。
// 每段第一小节空着（音符提前出发，换玩法、破屏也在这一小节里）。
// 曲子放在 public/local/ 下（技术验证用，曲子本身有版权，正式版要换掉）；没有这个文件时只打拍子。
import { bar, withHold, type Chart } from '../chart';

const STEPS = 16;
const rest = (lanes: number) => bar(lanes, STEPS, {});
/** 把几种小节按顺序排起来 */
const bars = (...list: string[][]): string[] => list.flat();

// ---- Give It Up：一个字符，只能写在整拍上（0 4 8 12）。u 跳上高一截的柱子，x 跨过尖刺（之后一拍在空中，不能再写）----
const v = (hits: Record<number, string>) => bar(1, STEPS, hits);
const GIVE_A = v({ 8: 'u' });
const GIVE_B = v({ 0: 'x', 8: 'u' });
const GIVE_C = v({ 0: 'u', 4: 'u', 8: 'x' });
const GIVE_D = v({ 0: 'x', 8: 'x' });

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

// ---- 节奏大师：三条道（A S D）；H 是长按的头。按着长按的时候别的道上不来音符，松手之后至少隔一拍再来 ----
const m = (hits: Record<number, string>) => bar(3, STEPS, hits);
const MANIA_A = m({ 0: 'x..', 4: '.x.', 8: '..x', 12: '.x.' });
const MANIA_B = withHold(m({ 12: '.x.' }), 0, 0, 6, 'H');                                // 左边按住一拍半，松手后再点一下
const MANIA_C = m({ 0: 'x..', 2: '.x.', 4: '..x', 7: 'x..', 9: '.x.', 11: '..x', 13: '.x.', 14: 'x..' });   // 主旋律
const MANIA_D = withHold(m({ 0: 'x..', 2: '.x.' }), 2, 6, 6, 'H');                       // 先点两下，再在右边按住一拍半
const MANIA_E = withHold(m({ 10: '.x.', 14: '..x' }), 1, 0, 4, 'H');                     // 中间按住一拍，松手后点两下

// ---- osu!：四列（Q W E R），数字是圈悬多高（1 低 2 中 3 高）；a b c 是长按的圈（低 中 高）。按着的时候不来别的圈 ----
const o = (hits: Record<number, string>) => bar(4, STEPS, hits);
const OSU_A = o({ 0: '1...', 4: '.2..', 8: '..3.', 12: '...2' });
const OSU_B = withHold(o({ 12: '..3.' }), 0, 0, 6, 'b');                                  // 左边一个长按的圈，松手后再点一个
const OSU_C = o({ 0: '1...', 2: '.2..', 4: '..3.', 7: '...2', 9: '..1.', 11: '.3..', 13: '2...', 14: '...1' });   // 主旋律
const OSU_D = withHold(o({ 0: '.2..' }), 3, 6, 6, 'c');                                   // 先点一个，再在右上按住一个长的

// ---- 光剑：四条道（Q W E R）----
const s = (hits: Record<number, string>) => bar(4, STEPS, hits);
const SABER_A = s({ 0: 'x...', 4: '...x', 8: '.x..', 12: '..x.' });
const SABER_B = s({ 0: '.x..', 4: '..x.', 8: 'x...', 10: '...x', 12: 'x...' });
const SABER_C = s({ 0: 'x...', 2: '.x..', 4: '..x.', 7: '...x', 9: '.x..', 11: '..x.', 13: 'x...', 14: '...x' });   // 主旋律
const SABER_D = s({ 0: '...x', 2: '..x.', 4: '.x..', 7: 'x...', 9: '..x.', 11: '.x..', 13: '...x', 14: 'x...' });

// ---- 躲：四条道，o 红墙、_ 黄杠。两拍来一排（中间有一秒钟看清、换道），每排最多封两条道；整排黄杠单独来 ----
const g = (hits: Record<number, string>) => bar(4, STEPS, hits);
const DODGE_A = g({ 0: 'o...', 8: '...o' });
const DODGE_B = g({ 0: '.oo.', 8: 'o..o' });
const DODGE_C = g({ 0: 'oo..', 8: '..oo' });
const DODGE_JUMP = g({ 0: '____', 8: '.o..' });
const DODGE_D = g({ 0: 'o.o.', 8: '____' });

export const MEGALOVANIA: Chart = {
  id: 'megalovania',
  arena: 'festival',
  audio: 'local/Undertale_Megalovania.mp3',
  bpm: 120,
  offsetMs: 150,
  stepsPerBeat: 4,
  sections: [
    { mode: 'giveup', rows: bars(rest(1), GIVE_A, GIVE_A, GIVE_B, GIVE_B, GIVE_C, GIVE_D, GIVE_C) },                      // 0:00 安静的前奏
    { mode: 'dash', rows: bars(rest(2), DASH_A, DASH_B, DASH_C, DASH_D, DASH_C, DASH_D, DASH_D) },                        // 0:16
    { mode: 'taiko', rows: bars(rest(1), TAIKO_A, TAIKO_B, TAIKO_C, TAIKO_B, TAIKO_C, TAIKO_D, TAIKO_D) },                // 0:32 渐强
    { mode: 'mania', rows: bars(rest(3), MANIA_A, MANIA_B, MANIA_C, MANIA_E, MANIA_C, MANIA_D, MANIA_C) },                // 0:48 高潮
    { mode: 'osu', rows: bars(rest(4), OSU_A, OSU_B, OSU_A, OSU_C, OSU_D, OSU_C, OSU_C) },                                // 1:04 破屏
    { mode: 'saber', rows: bars(rest(4), SABER_A, SABER_B, SABER_A, SABER_B, SABER_C, SABER_B, SABER_C,                   // 1:20 超级高潮
      SABER_C, SABER_D, SABER_C, SABER_D, SABER_D, SABER_C, SABER_D, SABER_D) },
    { mode: 'dodge', rows: bars(rest(4), DODGE_A, DODGE_A, DODGE_B, DODGE_JUMP, DODGE_C, DODGE_B, DODGE_D) },             // 1:52 回落，躲弹幕收尾
  ],
};
