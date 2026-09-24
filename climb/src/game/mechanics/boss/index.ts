// ===== 通用机制：Boss 房（大史莱姆） =====
// 放了 Boss 物件的房间就是 Boss 战；旧地图里 roomFlags.boss 的房间也算。
import { defineMechanic, floorHasEntities } from '../define';
import { BossFight } from './BossFight';

const BOSS = 'K';

const boss = defineMechanic({
  id: 'boss', name: 'Boss 房', desc: '进门封门、出血条；只有落石和引线能伤它',
  scope: 'global',
  activeOn: floor => floorHasEntities(floor, [BOSS]) || Object.values(floor.model.roomFlags ?? {}).some(f => f.boss),
  create: ctx => new BossFight(ctx),
});

boss.entity({
  id: BOSS, name: 'Boss 大史莱姆', desc: '放进哪个房间，那个房间就是 Boss 战：进门封门、出血条，Boss 从这里落下。只有落石和引线能伤它', texture: 'boss', color: 0x9b5de5,
  spawn: (fight, at) => fight.addBoss({ x: at.x, y: at.y, rx: at.cell.rx, ry: at.cell.ry }),
});
