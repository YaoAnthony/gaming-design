// ===== 通用机制：Boss 房（史莱姆王） =====
// 放了 Boss 物件的房间就是 Boss 战；旧地图里 roomFlags.boss 的房间也算。
// Boss 房里可以再涂「Boss 触发点」（一格一格涂，连成线 / 一片都行）：玩家碰到其中任何一格才封门出 Boss；没涂就是进房走离门口一格半就开打。
// 物品栏里它紧跟在 Boss 后面注册，所以和 Boss 一左一右挨着。
import { defineMechanic, floorHasEntities } from '../define';
import { BossFight } from './BossFight';
import { Colors } from '@/game/palette';

const BOSS = 'K';
const TRIGGER = 'k';

const boss = defineMechanic({
  id: 'boss', name: 'Boss 房', desc: '进门封门、出血条；只有落石和引线能伤它',
  scope: 'global',
  activeOn: floor => floorHasEntities(floor, [BOSS]) || Object.values(floor.model.roomFlags ?? {}).some(f => f.boss),
  create: ctx => new BossFight(ctx),
});

boss.entity({
  id: BOSS, name: 'Boss 史莱姆王', desc: '放进哪个房间，那个房间就是 Boss 战：进门封门、WARNING 之后 Boss 从这一列的高处落下、血条涨满、亮名字才开打。只有落石和引线能伤它', texture: 'boss', color: Colors.violet,
  spawn: (fight, at) => fight.addBoss({ x: at.x, y: at.y, rx: at.cell.rx, ry: at.cell.ry }),
});

boss.entity({
  id: TRIGGER, name: 'Boss 触发点', desc: '涂在 Boss 房里（按住拖动连着涂，竖一条、一片都行）：玩家碰到其中任何一格才封门、出 Boss，房间别处随便走都不会提前触发。游戏里看不见；没涂就是进房走离门口一格半就开打',
  texture: 'bossTrigger', color: Colors.rose,
  spawn: (fight, at) => fight.addTrigger({ x: at.x, y: at.y, rx: at.cell.rx, ry: at.cell.ry }),
});
