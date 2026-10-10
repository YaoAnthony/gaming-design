// ===== 通用机制：挡块（只挡怪物和箱子） =====
// 地图上放了挡块才启用。
import { defineMechanic } from '../define';
import { Stoppers } from './Stoppers';

const stopper = defineMechanic({
  id: 'stopper', name: '挡块', desc: '只挡怪物和箱子，主角穿得过去：路中间立在正中，崖边立在悬崖那一边',
  scope: 'global',
  create: ctx => new Stoppers(ctx),
});

stopper.entity({
  id: 'I', name: '挡块', desc: '只挡怪物和箱子，主角能直接穿过去。放在路中间就立在格子正中（箱子进不了这一格）；放在崖边会自己判断哪边是悬崖，立在这一格里靠悬崖那边（箱子过不去这一格、推不下悬崖，追人的怪物也冲不下去）。脚下的地没了就失效', texture: 'stopper', color: 0xb2a0cc, origin: [0.5, 1],
  spawn: (s, at) => s.add(at),
});
