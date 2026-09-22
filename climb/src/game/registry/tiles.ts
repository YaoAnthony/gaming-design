// ===== 所有砖块与物件的注册 =====
// 想加新砖块：照着写一个 defineTile，其余系统自动认识它（地形、爆炸、掉落、贴图、编辑器物品栏）。
import { TILE_FRAMES } from '@/asset';
import { defineEntity, defineTile, Traits } from './registry';

// ---------- 砖块 ----------
defineTile({ id: '.', name: '空气 / 橡皮', desc: '什么都没有', color: 0x000000 });

defineTile(
  { id: '#', name: '泥土', desc: '爆炸范围内会被炸掉；没连到岩石就会掉落', color: 0x8d5a3b, frame: TILE_FRAMES.dirt },
  Traits.Solid, Traits.Destructible(0),
);

defineTile(
  { id: 'R', name: '岩石', desc: '炸不动，也是唯一的锚点', color: 0x5d6470, frame: TILE_FRAMES.rock },
  Traits.Solid, Traits.Anchor,
);

defineTile(
  { id: 'B', name: '脆岩', desc: '周围一有爆炸（含引线）就整块松脱、随重力掉下来，相连的一起掉；炸不没', color: 0xc9b27c, frame: TILE_FRAMES.brittle },
  Traits.Solid, Traits.Loose(1),
);

defineTile(
  { id: 'S', name: '沙土', desc: '像泥土，但爆炸范围外一圈也会被震碎（不连锁）', color: 0xd9a066, frame: TILE_FRAMES.sand },
  Traits.Solid, Traits.Destructible(1),
);

defineTile(
  { id: 'X', name: '尖刺', desc: '碰到即死；掉下来的地块会把它盖住', color: 0xef476f, frame: TILE_FRAMES.spikes },
  Traits.Hazard('扎到尖刺了'),
);
// ---------- 物件 ----------
defineEntity({
  id: 'P', name: '出生点', desc: '玩家从这里开始（全图唯一）', texture: 'player', unique: true, color: 0x4cc9f0,
  spawn({ host, wx, wy }) { host.spawnPoints.push({ x: wx, y: wy }); },
});

defineEntity({
  id: 'M', name: '怪物', desc: '在房间里巡逻，碰到即死；会被落石压扁', texture: 'enemy', color: 0x9b5de5,
  spawn({ host, wx, wy, cell }) { host.addEnemy({ x: wx, y: wy, rx: cell.rx, ry: cell.ry }); },
});

defineEntity({
  id: 'G', name: '终点', desc: '碰到即通关，上面会画一座建筑', texture: 'door', color: 0xffd166,
  spawn({ host, wx, wy }) { host.setGoal({ x: wx, y: wy }); },
});
