// ===== 所有砖块与物件的注册 =====
// 想加新砖块：照着写一个 defineTile，其余系统自动认识它（地形、爆炸、掉落、贴图、编辑器物品栏）。
import { TILE_FRAMES } from '@/asset';
import { defineEntity, defineTile, Traits } from './registry';
import { DIALOGUES } from './dialogues';

// ---------- 砖块 ----------
defineTile({ id: '.', name: '空气 / 橡皮', desc: '什么都没有', color: 0x000000 });

defineTile(
  { id: '#', name: '泥土', desc: '爆炸范围内会被炸掉；自己不会掉，也撑得住别的砖', color: 0x8d5a3b, frame: TILE_FRAMES.dirt },
  Traits.Solid, Traits.Anchor, Traits.Destructible(0),
);

defineTile(
  { id: 'R', name: '岩石', desc: '炸不动的锚点', color: 0x5d6470, frame: TILE_FRAMES.rock },
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
  Traits.Hazard('扎到尖刺了', { x: 2, y: 20, w: 28, h: 12 }),   // 只有尖刺本体那一条会扎人，上面的空档不算
);
defineTile(
  { id: 'Z', name: '纸', desc: '周围一有爆炸就松脱，慢慢飘下来；飘到怪物头上会被驮着走，可以踩', color: 0xf4f1e8, frame: TILE_FRAMES.paper },
  Traits.Solid, Traits.Loose(1), Traits.Float(55),
);

defineTile(
  { id: '=', name: '字块', desc: '文字方块默认用它：可炸，但自己不会掉、也撑得住别的砖（悬空的字才站得住）', color: 0xb8c4e0, frame: TILE_FRAMES.letter },
  Traits.Solid, Traits.Anchor, Traits.Destructible(0),
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
  id: 'K', name: 'Boss 大史莱姆', desc: '放进哪个房间，那个房间就是 Boss 战：进门封门、出血条，Boss 从这里落下。只有落石和引线能伤它', texture: 'boss', color: 0x9b5de5,
  spawn({ host, wx, wy, cell }) { host.addBoss({ x: wx, y: wy, rx: cell.rx, ry: cell.ry }); },
});

defineEntity({
  id: 'T', name: '小城堡', desc: '走进城门到下一层', texture: 'castle', color: 0x4cc9f0, origin: [0.5, 1],
  spawn({ host, wx, wy }) { host.addPortal({ x: wx, y: wy }); },
});

defineEntity({
  id: 'G', name: '终点', desc: '碰到即通关，上面会画一座建筑', texture: 'door', color: 0xffd166,
  spawn({ host, wx, wy }) { host.setGoal({ x: wx, y: wy }); },
});

defineEntity({
  id: 'N', name: '骷髅', desc: '挡在路上的小角色。走近强制对话，每跳一次说下一句，说完就消失', texture: 'skeleton', color: 0xf1efe6, origin: [0.5, 1],
  spawn({ host, wx, wy }) { host.addNpc({ x: wx, y: wy, name: '骷髅', texture: 'skeleton', avatar: 'default', lines: DIALOGUES.skeleton, sound: 'bossLaugh' }); },
});
