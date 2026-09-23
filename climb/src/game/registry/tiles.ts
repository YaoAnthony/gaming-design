// ===== 所有砖块与物件的注册 =====
// 想加新砖块：照着写一个 defineTile，其余系统自动认识它（地形、爆炸、掉落、贴图、编辑器物品栏）。
import { TILE_FRAMES } from '@/asset';
import { defineEntity, defineItem, defineTile, Items, Traits } from './registry';
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

defineTile(
  { id: '%', name: '门', desc: '锁着的门：拿对应颜色的钥匙碰一下就开。由「钥匙与门」工具烘焙，不直接画', color: 0xbdbdbd, frame: TILE_FRAMES.door, editorVisible: false },
  Traits.Solid, Traits.Anchor,
);

// ---------- 道具 ----------
const candle = defineItem({ id: 'candle', name: '蜡烛', texture: 'candle', light: 8 });

defineEntity({
  id: 'C', name: '蜡烛', desc: '地上的蜡烛。捡起来拿在右手，周围 8 格被照亮', texture: 'candle', color: 0xffd166, origin: [0.5, 1],
  spawn({ host, wx, wy }) { host.addItem({ x: wx, y: wy, item: Items.get(candle.id)! }); },
});

defineEntity({
  id: 'V', name: '音量滑块', desc: '设置房间用：喇叭图标右边一条轨道，走过去把滑钮推到哪儿，音乐就多大', texture: 'volume', color: 0xffd166, origin: [0.5, 1],
  spawn({ host, wx, wy }) { host.addSlider({ x: wx, y: wy, length: 8, config: 'musicVolume', min: 0, max: 1 }); },
});

// ---------- 吃豆人（俯视层用） ----------
const PAC = '吃豆人';
defineEntity({ id: 'o', name: '豆子', desc: '吃一颗 10 分。房间里的豆子吃光会触发后面的剧情', texture: 'pellet', color: 0xffe8b0, group: PAC, spawn({ host, wx, wy }) { host.addPellet({ x: wx, y: wy }, false); } });
defineEntity({ id: 'O', name: '大力丸', desc: '50 分，鬼全部变蓝一段时间，可以反吃', texture: 'power', color: 0xffe8b0, group: PAC, spawn({ host, wx, wy }) { host.addPellet({ x: wx, y: wy }, true); } });
defineEntity({ id: 'H', name: '鬼巢', desc: '四只鬼从这里出来，被吃后回这里复活。放在巢的门口那一格', texture: 'ghosthouse', color: 0xffb3c6, group: PAC, spawn({ host, wx, wy }) { host.addGhostHouse({ x: wx, y: wy }); } });
defineEntity({ id: 'F', name: '葡萄点', desc: '吃到 70 颗和 170 颗豆子时在这里出现葡萄，9 秒内吃到加分', texture: 'grapes', color: 0x9b5de5, group: PAC, spawn({ host, wx, wy }) { host.addFruitPoint({ x: wx, y: wy }); } });
defineEntity({ id: '~', name: '隧道格', desc: '鬼经过这里减速；配合房间开关「左右打通」做穿屏隧道。游戏里不可见', texture: 'tunnel', color: 0x4cc9f0, group: PAC, spawn({ host, cell }) { host.addTunnel({ x: cell.x, y: cell.y }); } });
