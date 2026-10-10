// ===== 注册所有机制（副作用导入） =====
// 顺序有意义：
// - 每帧 update / updateAlive 按这个顺序调用
// - bake 按这个顺序改模型（文字方块要在门之前烘：门盖在文字方块上，开门后露出来）
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
import './tape';
import './pushBlock';
import './stopper';   // 挡块：推箱子要问它，放在后面也行（只在 updateAlive 里问）
import './mover';
import './solve';   // 看别的机制的状态（门、Boss、移动方块）：放在它们后面
import './story';
import './rhythm';   // 每一层都启用（听「开一场」），放最后：每帧在别的机制之后跑

export { Mechanics, floorMechanicOf, floorMechanics, globalMechanicsOf } from './define';
