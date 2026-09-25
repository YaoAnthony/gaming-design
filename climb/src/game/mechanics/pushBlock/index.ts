// ===== 通用机制：可推的箱子 =====
// 1x1 谁都推得动；2x2 要身高 2 格（戴帽子）才推得动。规则：身高 ≥ 箱子高。
import { defineMechanic } from '../define';
import { PushBlocks } from './PushBlocks';

const pushBlock = defineMechanic({
  id: 'pushBlock', name: '箱子', desc: '贴着推就走，有重力；身高 ≥ 箱子高才推得动',
  scope: 'global',
  create: ctx => new PushBlocks(ctx),
});

pushBlock.entity({
  id: 'b', name: '小箱子 1x1', desc: '贴着往前走就能推；推出边缘会掉下去；爆炸炸不动，可以站上去', texture: 'crate1', color: 0xb07a45,
  spawn: (pb, at) => pb.addBlock(1, at.cell),
});
pushBlock.entity({
  id: 'D', name: '大箱子 2x2', desc: '要 2 格高（戴帽子）才推得动。放的那一格是它的左下角', texture: 'crate2', color: 0x8f6a4a, origin: [0, 1],
  spawn: (pb, at) => pb.addBlock(2, at.cell),
});
