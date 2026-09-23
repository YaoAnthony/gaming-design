// ===== 对话文本 =====
// 每个会说话的角色一段台词；玩家每跳一次（炸一次）就说下一句，说完角色消失。
// 每句可以单独指定 avatar（表情），不写就用角色的默认头像。
import type { DialogueLine } from '@/type';

export const DIALOGUES: Record<string, DialogueLine[]> = {
  skeleton: [
    { text: '哇！！吓死我了，你怎么走路没有声音啊' },
    { text: '喂，你怎么还炸我一下，很疼啊' },
    { text: '嗯.... 这是你表达回复的方式？' },
    { text: '怎么你对后面的建筑感兴趣？' },
    { text: '那是我的小家，没什么好看的，你已经通关了，恭喜你，你可以回家了' },
    { text: '我跟你说别炸了，time to go home!' },
    { text: '这么想去我家看看？' },
    { text: '哈哈哈，那你可别后悔', avatar: 'laugh' },
  ],
  /** 吃豆人层：豆子吃光之后（骷髅王的画外音，自动翻页） */
  pacTaunt: [
    { text: '哈哈哈，你是不是以为吃完东西就赢了？', avatar: 'laugh', autoMs: 2800 },
    { text: '接着被追下去吧', autoMs: 2200 },
  ],
  /** 鬼全灭之后 */
  pacKing: [
    { text: '嗯~ 这葡萄真好吃，也不知道这小子被追的怎么样了', autoMs: 3400 },
    { text: '诶？！怎么全没了', autoMs: 2400 },
  ],
};
