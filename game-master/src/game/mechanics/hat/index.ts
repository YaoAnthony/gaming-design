// ===== 通用机制：帽子 =====
// 每一层都启用：戴着的帽子会带到下一层，就算那一层地上没有帽子。
import { defineMechanic } from '../define';
import { Hat } from './Hat';

const hat = defineMechanic({
  id: 'hat', name: '帽子', desc: '戴在头上，主角变成 2 格高；钻 1 格高的隧道会被撞掉',
  scope: 'global',
  activeOn: () => true,
  create: ctx => new Hat(ctx),
});

hat.entity({
  id: 'h', name: '高脚帽', desc: '碰到就戴上：主角变 2 格高，能推 2x2 的箱子；↓ / S 摘下；钻 1 格高的隧道会被撞掉', texture: 'hat', color: 0x1e1e28, origin: [0.5, 1],
  spawn: (h, at) => h.addHat(at.x, at.y),
});
