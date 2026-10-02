// 技术验证用的谱：Megalovania 的前 128 秒（120 BPM，第一拍在 0.15 秒；一小节 4 拍 = 2 秒，一行 = 十六分音符）。
// 编排：前面一直在 2D 画面里（Give It Up → 喵斯快跑 → 太鼓 → 节奏大师），1:04 破屏到 3D（osu! 点圈 → 光剑），最后躲弹幕收尾。
// 前五段是照着 recordings/megalovania.json（在技术验证编辑器里录的那一遍）的意思排的：录音里按得不太齐的都收到八分音符的格子上，
// 十六分的连打抽稀。难度一段比一段高、每一段里也是前松后紧：Give It Up 一小节一两下 → 重力翻转三四下 → 太鼓、节奏大师四到八下
// → 刚破屏的 osu 先缓一下 → 光剑是最高潮 → 躲弹幕回落。每段第一小节空着（音符提前出发，换玩法、破屏也在这一小节里）。
// 曲子放在 public/local/ 下（技术验证用，曲子本身有版权，正式版要换掉）；没有这个文件时只打拍子。
import { bar, withHold, type Chart } from '../chart';

const STEPS = 16;
const rest = (lanes: number) => bar(lanes, STEPS, {});
/** 把几种小节按顺序排起来 */
const bars = (...list: string[][]): string[] => list.flat();

// ---- Give It Up：一个字符，只能写在整拍上（0 4 8 12）。u 跳上高一截的柱子，x 跨过尖刺（之后一拍在空中，不能再写）----
// 录音里的意思：前三小节一小节只在第一拍跳一下，后面几小节前三拍连着跳。
const v = (hits: Record<number, string>) => bar(1, STEPS, hits);
const GIVE_1 = v({ 0: 'u' });                                              // 只在第一拍跳一下
const GIVE_2 = v({ 0: 'u', 8: 'u' });
const GIVE_3 = v({ 0: 'u', 8: 'x' });                                      // 第一次见到尖刺
const GIVE_4 = v({ 0: 'u', 4: 'u', 8: 'u' });                              // 前三拍连上三级
const GIVE_5 = v({ 0: 'u', 4: 'u', 8: 'x' });
const GIVE_6 = v({ 0: 'x', 8: 'u' });

// ---- 喵斯快跑（重力翻转）：两个字符，第一个是上排（天花板），第二个是下排（地面）。人一开始在地面；换排才要按空格 ----
// 录音里的意思：每小节开头连着三下（0 2 4），后半小节留白。前几小节先用整拍把「翻」练熟。
const d = (hits: Record<number, string>) => bar(2, STEPS, hits);
const DASH_1 = d({ 0: '.x', 4: 'x.', 8: '.x' });                          // 一拍翻一次
const DASH_2 = d({ 0: '.x', 2: '.x', 4: 'x.', 8: 'x.' });                 // 同一排连着两个不用按
const DASH_3 = d({ 0: '.x', 2: 'x.', 4: '.x', 8: '.x' });                 // 开头连翻三下
const DASH_4 = d({ 0: 'x.', 4: '.x', 8: 'x.', 12: '.x' });
const DASH_5 = d({ 0: '.x', 2: 'x.', 4: '.x', 12: 'x.' });
const DASH_6 = d({ 0: 'x.', 2: '.x', 4: 'x.', 8: '.x', 12: '.x' });
const DASH_7 = d({ 0: 'x.', 2: '.x', 4: 'x.', 6: '.x', 8: 'x.' });        // 收尾：半拍一翻，连翻五下

// ---- 太鼓：一个字符，r 红（A）b 蓝（D）----
// 录音里的意思：红蓝交替的八分音符，越往后越密。十六分的切分都收到八分音符上。
const t = (hits: Record<number, string>) => bar(1, STEPS, hits);
const TAIKO_1 = t({ 0: 'r', 4: 'b', 8: 'r', 12: 'b' });                   // 一拍一下，红蓝交替
const TAIKO_2 = t({ 0: 'b', 2: 'b', 4: 'b', 8: 'r', 12: 'r' });           // 同色连敲
const TAIKO_3 = t({ 0: 'r', 2: 'b', 4: 'r', 8: 'b', 12: 'r' });
const TAIKO_4 = t({ 0: 'b', 4: 'b', 6: 'b', 8: 'b', 12: 'r', 14: 'r' });
const TAIKO_5 = t({ 0: 'r', 2: 'r', 4: 'r', 8: 'b', 10: 'b', 12: 'r' });
const TAIKO_6 = t({ 0: 'r', 2: 'b', 4: 'r', 6: 'b', 8: 'r', 10: 'b', 12: 'r', 14: 'b' });   // 最密的一小节：八分音符红蓝交替到底
const TAIKO_7 = t({ 0: 'r', 2: 'b', 4: 'r', 6: 'b', 8: 'r' });

// ---- 节奏大师：三条道（A S D）；H 是长按的头。按着长按的时候别的道上不来音符，松手之后至少隔一拍再来 ----
// 录音里的意思：A S D 一级级走的楼梯。十六分的楼梯收成八分音符，中间夹两个长按喘口气。
const m = (hits: Record<number, string>) => bar(3, STEPS, hits);
const MANIA_1 = m({ 0: 'x..', 4: '.x.', 8: '..x', 12: '.x.' });           // 一拍一级，走过去再回来
const MANIA_2 = m({ 0: 'x..', 2: '.x.', 4: '..x', 8: '.x.', 12: 'x..' }); // 开头半拍一级的楼梯
const MANIA_HOLD = withHold(m({ 12: '.x.' }), 0, 0, 6, 'H');              // 左边按住一拍半，松手后再点一下
const MANIA_3 = m({ 0: 'x..', 2: '.x.', 4: '..x', 6: '.x.', 8: 'x..', 12: '..x' });
const MANIA_4 = m({ 0: '.x.', 4: 'x..', 8: '.x.', 12: '..x' });           // 喘口气
const MANIA_HOLD2 = withHold(m({ 0: '.x.', 2: 'x..' }), 2, 6, 6, 'H');    // 先点两下，再在右边按住一拍半
const MANIA_5 = m({ 0: 'x..', 2: '.x.', 4: '..x', 6: '.x.', 8: 'x.x', 12: '.x.' });   // 收尾：楼梯 + 两边一起按

// ---- osu!：四列（Q W E R），数字是圈悬多高（1 低 2 中 3 高）；a b c 是长按的圈；A B C 往右滑、x y z 往左滑的滑条 ----
// 录音里的意思：以 W 为中心左右点，偶尔从左到右扫一遍。刚破屏先慢一点，认一认四列。
const o = (hits: Record<number, string>) => bar(4, STEPS, hits);
const OSU_1 = o({ 0: '.2..', 8: '..2.', 12: '1...' });                    // 刚出来：先来三个
const OSU_2 = o({ 0: '.1..', 4: '..2.', 8: '...3', 12: '.2..' });
const OSU_3 = o({ 0: '.2..', 4: '1...', 6: '.2..', 8: '..3.', 12: '...2' });   // 从左扫到右
const OSU_HOLD = withHold(o({ 12: '..3.' }), 0, 0, 6, 'b');               // 左边一个长按的圈
const OSU_SLIDE_L = withHold(o({ 0: '1...', 2: '.2..' }), 3, 6, 6, 'y');  // 先点两个，再从最右往左滑一列
const OSU_SLIDE_R = withHold(o({ 12: '...1' }), 1, 0, 6, 'B');            // 从第二列往右滑到第三列
const OSU_4 = o({ 0: '.2..', 4: '1...', 6: '.2..', 8: '..3.', 10: '...2', 12: '..1.' });

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
    { mode: 'giveup', rows: bars(rest(1), GIVE_1, GIVE_1, GIVE_2, GIVE_3, GIVE_4, GIVE_5, GIVE_6) },                       // 0:00 安静的前奏
    { mode: 'dash', rows: bars(rest(2), DASH_1, DASH_2, DASH_3, DASH_4, DASH_5, DASH_6, DASH_7) },                         // 0:16
    { mode: 'taiko', rows: bars(rest(1), TAIKO_1, TAIKO_2, TAIKO_3, TAIKO_4, TAIKO_5, TAIKO_6, TAIKO_7) },                 // 0:32 渐强
    { mode: 'mania', say: 'dialogue.festival.5', rows: bars(rest(3), MANIA_1, MANIA_2, MANIA_HOLD, MANIA_3, MANIA_4, MANIA_HOLD2, MANIA_5) },   // 0:48 高潮
    { mode: 'osu', rows: bars(rest(4), OSU_1, OSU_2, OSU_3, OSU_HOLD, OSU_SLIDE_L, OSU_SLIDE_R, OSU_4) },                  // 1:04 破屏
    { mode: 'saber', rows: bars(rest(4), SABER_STAY, SABER_STEP, SABER_STEP, SABER_HOME, SABER_UP, SABER_DOWN, SABER_HOME,   // 1:20 超级高潮
      SABER_TWICE, SABER_STEP, SABER_HOME, SABER_UP, SABER_DOWN, SABER_TWICE, SABER_RUN, SABER_HOME) },
    { mode: 'dodge', rows: bars(rest(4), DODGE_A, DODGE_B, DODGE_A, DODGE_JUMP, DODGE_C, DODGE_D, DODGE_C) },             // 1:52 回落，躲弹幕收尾
  ],
};
