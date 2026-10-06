// ===== 吃豆人层的剧情台词（Game Master 的画外音，自动翻页）；text 是 i18n key =====
import type { DialogueLine } from '@/type';

export const PAC_DIALOGUES = {
  /** 豆子吃光之后 */
  taunt: [
    { text: 'dialogue.pacTaunt.0', avatar: 'laugh', autoMs: 2800 },
    { text: 'dialogue.pacTaunt.1', autoMs: 2200 },
  ],
  /** 鬼全灭之后 */
  king: [
    { text: 'dialogue.pacKing.0', autoMs: 3400 },
    { text: 'dialogue.pacKing.1', autoMs: 2400 },
  ],
} satisfies Record<string, DialogueLine[]>;
