// ===== 注册所有机制（副作用导入） =====
// 顺序有意义：
// - 每帧 update / updateAlive 按这个顺序调用
// - bake 按这个顺序改模型（文字方块要在门之前烘：门只占空气格）
// - 物品栏里同一分区的物件按这个顺序排
// 新机制：在 mechanics/ 下建一个文件夹，index.ts 里 defineMechanic，然后在这里加一行。

// 层机制
import './platform';
import './pacman';

// 通用机制
import './boss';
import './goal';
import './portal';
import './textBlock';
import './npc';
import './carry';
import './slider';
import './locks';
import './hat';
import './pushBlock';

export { Mechanics, floorMechanicOf, floorMechanics, globalMechanicsOf } from './define';
