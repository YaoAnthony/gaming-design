// ===== 吃豆人层的剧情台词（骷髅王的画外音，自动翻页） =====
import type { DialogueLine } from '@/type';

export const PAC_DIALOGUES = {
  /** 豆子吃光之后 */
  taunt: [
    { text: '哈哈哈，你是不是以为吃完东西就赢了？', avatar: 'laugh', autoMs: 2800 },
    { text: '接着被追下去吧', autoMs: 2200 },
  ],
  /** 鬼全灭之后 */
  king: [
    { text: '嗯~ 这葡萄真好吃，也不知道这小子被追的怎么样了', autoMs: 3400 },
    { text: '诶？！怎么全没了', autoMs: 2400 },
  ],
} satisfies Record<string, DialogueLine[]>;
