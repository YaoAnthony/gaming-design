// 技术验证用的谱：Megalovania 的前 128 秒（120 BPM，第一拍在 0.15 秒；一小节 4 拍 = 2 秒，一行 = 十六分音符）。
// 编排：前面一直在 2D 画面里（Give It Up → 喵斯快跑 → 太鼓 → 节奏大师），1:04 破屏到 3D（osu! 点圈 → 光剑），最后躲弹幕收尾。
// 难度居中：以整拍为主（一小节四下左右），每段后半夹一些八分音符；没有十六分音符的切分。每段第一小节空着（音符提前出发，换玩法、破屏也在这一小节里）。
// 曲子放在 public/local/ 下（技术验证用，曲子本身有版权，正式版要换掉）；没有这个文件时只打拍子。
import { bar, withHold, type Chart } from '../chart';

const STEPS = 16;
const rest = (lanes: number) => bar(lanes, STEPS, {});
/** 把几种小节按顺序排起来 */
const bars = (...list: string[][]): string[] => list.flat();

// ---- Give It Up：一个字符，只能写在整拍上（0 4 8 12）。u 跳上高一截的柱子，x 跨过尖刺（之后一拍在空中，不能再写）----
const v = (hits: Record<number, string>) => bar(1, STEPS, hits);
const GIVE_A = v({ 0: 'u', 8: 'u' });
const GIVE_B = v({ 0: 'x', 8: 'u' });
const GIVE_C = v({ 0: 'u', 4: 'u', 8: 'x' });                              // 连上两级再跨一根刺
const GIVE_D = v({ 0: 'x', 8: 'x' });

// ---- 喵斯快跑：两个字符，第一个是上排 ----
const d = (hits: Record<number, string>) => bar(2, STEPS, hits);
const DASH_A = d({ 0: '.x', 4: '.x', 8: 'x.', 12: '.x' });               // 每拍一下
const DASH_B = d({ 0: 'x.', 4: '.x', 8: 'x.', 12: 'x.' });
const DASH_C = d({ 0: '.x', 4: 'x.', 6: 'x.', 8: '.x', 12: 'x.' });      // 夹一个八分音符
const DASH_D = d({ 0: 'x.', 2: 'x.', 4: '.x', 8: 'x.', 10: '.x', 12: '.x' });

// ---- 太鼓：一个字符，r 红（咚）b 蓝（咔）----
const t = (hits: Record<number, string>) => bar(1, STEPS, hits);
const TAIKO_A = t({ 0: 'r', 4: 'r', 8: 'b', 12: 'r' });
const TAIKO_B = t({ 0: 'r', 4: 'b', 8: 'r', 10: 'r', 12: 'b' });
const TAIKO_C = t({ 0: 'r', 2: 'r', 4: 'b', 8: 'r', 10: 'r', 12: 'b' });
const TAIKO_D = t({ 0: 'r', 2: 'r', 4: 'b', 6: 'b', 8: 'r', 10: 'r', 12: 'b', 14: 'b' });   // 一路八分音符

// ---- 节奏大师：三条道（A S D）；H 是长按的头。按着长按的时候别的道上不来音符，松手之后至少隔一拍再来 ----
const m = (hits: Record<number, string>) => bar(3, STEPS, hits);
const MANIA_A = m({ 0: 'x..', 4: '.x.', 8: '..x', 12: '.x.' });
const MANIA_B = m({ 0: 'x..', 4: '..x', 6: '.x.', 8: 'x..', 12: '..x' });
const MANIA_C = m({ 0: 'x..', 2: '.x.', 4: '..x', 6: '.x.', 8: 'x..', 10: '.x.', 12: '..x' });   // 八分音符来回走
const MANIA_D = m({ 0: 'x.x', 4: '.x.', 8: 'x.x', 12: '.x.' });           // 两边一起按
const MANIA_HOLD = withHold(m({ 12: '.x.' }), 0, 0, 6, 'H');              // 左边按住一拍半，松手后再点一下
const MANIA_HOLD2 = withHold(m({ 0: '.x.', 2: 'x..' }), 2, 6, 6, 'H');    // 先点两下，再在右边按住一拍半

// ---- osu!：四列（Q W E R），数字是圈悬多高（1 低 2 中 3 高）；a b c 是长按的圈；A B C 往右滑、x y z 往左滑的滑条 ----
const o = (hits: Record<number, string>) => bar(4, STEPS, hits);
const OSU_A = o({ 0: '1...', 4: '.2..', 8: '..3.', 12: '...2' });
const OSU_B = o({ 0: '.2..', 4: '...1', 6: '..2.', 8: '.3..', 12: '1...' });
const OSU_C = o({ 0: '1...', 2: '.2..', 4: '..3.', 8: '...2', 10: '..1.', 12: '.3..' });   // 八分音符
const OSU_HOLD = withHold(o({ 12: '..3.' }), 0, 0, 6, 'b');               // 左边一个长按的圈
const OSU_SLIDE_R = withHold(o({ 12: '...1' }), 1, 0, 6, 'B');            // 从第二列往右滑到第三列
const OSU_SLIDE_L = withHold(o({ 0: '1...', 2: '.2..' }), 3, 6, 6, 'y');  // 先点两个，再从最右往左滑一列

// ---- 光剑：四条道。人要自己用 A D 换过去再砍：半拍来得及换一条道；同一条道上可以连着来（不用动，只管砍）----
const s = (hits: Record<number, string>) => bar(4, STEPS, hits);
const SABER_STAY = s({ 0: '.x..', 4: '.x..', 8: '.x..', 12: '..x.' });    // 人一开始就在第二条道：先砍三下再挪
const SABER_STEP = s({ 0: '..x.', 4: '.x..', 8: '..x.', 12: '.x..' });    // 一拍一下，左右挪
const SABER_UP = s({ 0: 'x...', 4: '.x..', 8: '..x.', 12: '...x' });      // 一拍一条，从左走到右
const SABER_DOWN = s({ 0: '...x', 4: '..x.', 8: '.x..', 12: 'x...' });
const SABER_TWICE = s({ 0: '.x..', 2: '.x..', 4: '..x.', 8: '..x.', 10: '..x.', 12: '.x..' });   // 一条道上快砍两下再挪
const SABER_RUN = s({ 0: 'x...', 2: '.x..', 4: '..x.', 6: '...x', 8: '...x', 10: '..x.', 12: '.x..', 14: 'x...' });   // 半拍一条，冲过去再冲回来
const SABER_HOME = s({ 0: 'x...', 4: '.x..', 8: '.x..', 12: '.x..' });    // 回到第二条道

// ---- 躲：四条道，o 红墙、_ 黄杠。前半两拍一排，后半一拍一排；每排最多封两条道，整排黄杠单独来 ----
const g = (hits: Record<number, string>) => bar(4, STEPS, hits);
const DODGE_A = g({ 0: 'o...', 8: '...o' });
const DODGE_B = g({ 0: '.oo.', 8: 'o..o' });
const DODGE_C = g({ 0: 'oo..', 4: '..oo', 8: 'o..o', 12: '.oo.' });       // 一拍一排
const DODGE_JUMP = g({ 0: '____', 8: '.o..', 12: 'o...' });
const DODGE_D = g({ 0: 'o.o.', 4: '.o.o', 8: '____', 12: 'oo..' });

export const MEGALOVANIA: Chart = {
  id: 'megalovania',
  arena: 'festival',
  audio: 'local/Undertale_Megalovania.mp3',
  bpm: 120,
  offsetMs: 150,
  stepsPerBeat: 4,
  sections: [
    { mode: 'giveup', rows: bars(rest(1), GIVE_A, GIVE_B, GIVE_A, GIVE_C, GIVE_B, GIVE_D, GIVE_C) },                      // 0:00 安静的前奏
    { mode: 'dash', rows: bars(rest(2), DASH_A, DASH_B, DASH_A, DASH_C, DASH_B, DASH_C, DASH_D) },                        // 0:16
    { mode: 'taiko', rows: bars(rest(1), TAIKO_A, TAIKO_B, TAIKO_A, TAIKO_C, TAIKO_B, TAIKO_C, TAIKO_D) },                // 0:32 渐强
    { mode: 'mania', say: 'dialogue.festival.5', rows: bars(rest(3), MANIA_A, MANIA_B, MANIA_HOLD, MANIA_C, MANIA_HOLD2, MANIA_D, MANIA_C) },   // 0:48 高潮
    { mode: 'osu', rows: bars(rest(4), OSU_A, OSU_B, OSU_HOLD, OSU_C, OSU_SLIDE_R, OSU_SLIDE_L, OSU_C) },                 // 1:04 破屏
    { mode: 'saber', rows: bars(rest(4), SABER_STAY, SABER_STEP, SABER_STEP, SABER_HOME, SABER_UP, SABER_DOWN, SABER_HOME,   // 1:20 超级高潮
      SABER_TWICE, SABER_STEP, SABER_HOME, SABER_UP, SABER_DOWN, SABER_RUN, SABER_RUN, SABER_HOME) },
    { mode: 'dodge', rows: bars(rest(4), DODGE_A, DODGE_B, DODGE_A, DODGE_JUMP, DODGE_C, DODGE_D, DODGE_C) },             // 1:52 回落，躲弹幕收尾
  ],
};
