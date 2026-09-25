// ===== 基础砖块与核心物件的注册 =====
// 想加新砖块：照着写一个 defineTile，其余系统自动认识它（地形、爆炸、掉落、贴图、编辑器物品栏）。
// 属于某个机制的砖块 / 物件（门、Boss、豆子……）在 game/mechanics/<机制>/index.ts 里注册。
import { TILE_FRAMES } from '@/asset';
import type { CoreHost, SpawnAt } from '@/type';
import { defineEntity, defineTile, Traits } from './registry';

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
  { id: 'B', name: '脆岩', desc: '周围一有爆炸（含引线）就整块松脱、随重力掉下来，相连的一起掉；炸不没。掉的时候也能站在上面', color: 0xc9b27c, frame: TILE_FRAMES.brittle },
  Traits.Solid, Traits.Loose(1), Traits.Rideable,
);

defineTile(
  { id: 'S', name: '沙土', desc: '像泥土，但爆炸范围外一圈也会被震碎（不连锁）。失去支撑掉下来的时候也能站在上面', color: 0xd9a066, frame: TILE_FRAMES.sand },
  Traits.Solid, Traits.Destructible(1), Traits.Rideable,
);

defineTile(
  { id: 'X', name: '尖刺', desc: '碰到即死；掉下来的地块会把它盖住；下面撑着它的方块没了，它也一起碎', color: 0xef476f, frame: TILE_FRAMES.spikes },
  Traits.Hazard('扎到尖刺了', { x: 2, y: 20, w: 28, h: 12 }),   // 只有尖刺本体那一条会扎人，上面的空档不算
  Traits.Mounted,
);
defineTile(
  { id: 'Z', name: '纸', desc: '周围一有爆炸就松脱，慢慢飘下来；飘到怪物头上会被驮着走，可以踩', color: 0xf4f1e8, frame: TILE_FRAMES.paper },
  Traits.Solid, Traits.Loose(1), Traits.Float(55),
);

defineTile(
  { id: '=', name: '字块', desc: '文字方块默认用它：可炸，但自己不会掉、也撑得住别的砖（悬空的字才站得住）', color: 0xb8c4e0, frame: TILE_FRAMES.letter },
  Traits.Solid, Traits.Anchor, Traits.Destructible(0),
);

// ---------- 核心物件 ----------
defineEntity({
  id: 'P', name: '出生点', desc: '玩家从这里开始（全图唯一）', texture: 'player', unique: true, color: 0x4cc9f0,
  spawn: (host: CoreHost, at: SpawnAt) => host.addSpawnPoint({ x: at.x, y: at.y }),
});

defineEntity({
  id: 'M', name: '怪物', desc: '在房间里巡逻，碰到即死；会被落石压扁', texture: 'enemy', color: 0x9b5de5,
  spawn: (host: CoreHost, at: SpawnAt) => host.addEnemy({ x: at.x, y: at.y, rx: at.cell.rx, ry: at.cell.ry }),
});
