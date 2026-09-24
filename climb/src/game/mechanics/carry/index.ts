// ===== 通用机制：携带 + 可捡的道具 =====
// 每一层都启用：手里的道具会带到下一层，就算那一层地上没有道具也要能拿着。
import { defineItem } from '@/game/registry/registry';
import { defineMechanic } from '../define';
import { Carry } from './Carry';

const carry = defineMechanic({
  id: 'carry', name: '携带', desc: '手上一个位置：碰到就捡，拿了新的旧的留在原地',
  scope: 'global',
  activeOn: () => true,
  create: ctx => new Carry(ctx),
});

// ---------- 道具 ----------
const candle = defineItem({ id: 'candle', name: '蜡烛', texture: 'candle', light: 8 });

carry.entity({
  id: 'C', name: '蜡烛', desc: '地上的蜡烛。捡起来拿在右手，周围 8 格被照亮', texture: 'candle', color: 0xffd166, origin: [0.5, 1],
  spawn: (c, at) => c.addItem(candle, at.x, at.y),
});
