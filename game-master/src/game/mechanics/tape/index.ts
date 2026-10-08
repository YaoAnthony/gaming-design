// ===== 通用机制：胶带（心的上限 +1） =====
// 每一层都启用：拿过的胶带加的心、捡过哪几卷要带到下一层、存进存档，就算那一层地上没有胶带。
import { defineMechanic } from '../define';
import { Tape } from './Tape';
import { Colors } from '@/shared/palette';

const tape = defineMechanic({
  id: 'tape', name: '胶带', desc: '发着金光的一卷胶带：碰到就捡起来，心的上限 +1，一直有效',
  scope: 'global',
  activeOn: () => true,
  create: ctx => new Tape(ctx),
});

tape.entity({
  id: 'U', name: '胶带', desc: '发着金光的一卷胶带，浮在这一格。碰到就捡起来：心的上限 +1（多出来的那颗是满的），一直有效、带到下一层；捡过的不会再出现', texture: 'tape', color: Colors.gold,
  spawn: (t, at) => t.add(at),
});
