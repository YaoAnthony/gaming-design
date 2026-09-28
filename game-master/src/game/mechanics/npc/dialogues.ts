// ===== 角色台词 =====
// 每个会说话的角色一段台词；玩家每跳一次（炸一次）就说下一句，说完角色消失。
// 每句可以单独指定 avatar（表情），不写就用角色的默认头像。text 是 i18n key，文字在 src/i18n/*.json 的 dialogue.* 里。
import type { DialogueLine } from '@/type';

export const DIALOGUES: Record<string, DialogueLine[]> = {
  skeleton: [
    { text: 'dialogue.skeleton.0' },
    { text: 'dialogue.skeleton.1' },
    { text: 'dialogue.skeleton.2' },
    { text: 'dialogue.skeleton.3' },
    { text: 'dialogue.skeleton.4' },
    { text: 'dialogue.skeleton.5' },
    { text: 'dialogue.skeleton.6' },
    { text: 'dialogue.skeleton.7', avatar: 'laugh' },
  ],
};
