// ===== 通用机制：会说话的角色 =====
// 新角色 = dialogues.ts 里一段台词 + 下面一个 npc.entity。
import { defineMechanic } from '../define';
import { Npcs } from './Npcs';
import { DIALOGUES } from './dialogues';

const npc = defineMechanic({
  id: 'npc', name: '会说话的角色', desc: '走近强制对话，每跳一次说下一句，说完就消失',
  scope: 'global',
  create: ctx => new Npcs(ctx),
});

npc.entity({
  id: 'N', name: '骷髅', desc: '挡在路上的小角色。走近强制对话，每跳一次说下一句，说完就消失', texture: 'skeleton', color: 0xf1efe6, origin: [0.5, 1],
  spawn: (n, at) => n.addNpc({ x: at.x, y: at.y, name: '骷髅', texture: 'skeleton', avatar: 'default', lines: DIALOGUES.skeleton, sound: 'bossLaugh' }),
});
