// ===== Boss 房的封门砖 =====
// 玩家走进 Boss 房后，房间四边的开口都换成它；打赢 / 重置时恢复成原来的地形。
// 长得像岩石，但炸不动、引线也烧不开：只有打赢才开门。
import { TILE_FRAMES } from '@/asset';
import { defineTile, Traits } from '@/game/registry/registry';
import { Colors } from '@/shared/palette';

export const SEAL = defineTile(
  { id: '|', name: 'Boss 封门', desc: 'Boss 战时封住房间的开口，打赢才开。由 Boss 机制放置，不直接画', color: Colors.dim, frame: TILE_FRAMES.rock, editorVisible: false },
  Traits.Solid, Traits.Anchor, Traits.Fireproof,
);
