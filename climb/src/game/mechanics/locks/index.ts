// ===== 通用机制：钥匙与门 =====
// 编辑器「钥匙与门」工具画的不是物件，是 model.locks；这一层有锁组就启用。
import { TILE_FRAMES } from '@/asset';
import { defineTile, Traits } from '@/game/registry/registry';
import { bakeLocks } from '@/game/world/WorldModel';
import { defineMechanic } from '../define';
import { Locks, type LockData } from './Locks';

defineTile(
  { id: '%', name: '门', desc: '锁着的门：拿对应颜色的钥匙碰一下就开。由「钥匙与门」工具烘焙，不直接画', color: 0xbdbdbd, frame: TILE_FRAMES.door, editorVisible: false },
  Traits.Solid, Traits.Anchor,
);

defineMechanic({
  id: 'locks', name: '钥匙与门', desc: '同色钥匙开同色的门，一把钥匙开一组',
  scope: 'global',
  activeOn: floor => !!floor.model.locks?.groups.length,
  /** 门烘成 % 砖（只占空气格），钥匙位置记下来 */
  bake: model => { const r = bakeLocks(model); return { model: r.model, data: { doors: r.doors, keys: r.keys } satisfies LockData }; },
  create: (ctx, data) => new Locks(ctx, data as LockData),
});
