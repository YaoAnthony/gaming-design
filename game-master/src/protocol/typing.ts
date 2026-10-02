// ===== 对话框的打字速度：画字的一侧（ui/Typewriter）和排时间的一侧（game/core/Dialogue）用同一份 =====
// 自动翻页的台词要等字打完才翻，所以两边得算出同一个时长。

/** 每秒打几个字：平时、越说越大的台词（说得慢一点） */
export const TYPE_CPS = { normal: 28, grow: 9 };
/** 越说越大的台词用它分截；画出来时截与截之间换成这个 */
export const GROW_SPLIT = '|', GROW_GAP = ' ';

/** 越说越大的台词分成的几截（除了最后一截，后面都带上间隔） */
export const growParts = (text: string): string[] => text.split(GROW_SPLIT).map((p, i, all) => (i < all.length - 1 ? p + GROW_GAP : p));

/** 这句话打完要多久（毫秒） */
export function typingMs(text: string, grow = false): number {
  const chars = grow ? growParts(text).reduce((n, p) => n + p.length, 0) : text.length;
  return chars / (grow ? TYPE_CPS.grow : TYPE_CPS.normal) * 1000;
}
