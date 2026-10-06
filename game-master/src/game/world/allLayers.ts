// ===== 登记所有按房间存的地图数据（副作用导入，见 layers.ts）=====
// 新机制要在地图里存自己的东西：在它的文件夹里写一个 layer.ts（defineGridLayer / defineRoomData），然后在这里加一行。
// 这里只放纯数据的登记文件（不碰 Phaser），WorldModel 和测试都会 import 它。
import '@/game/fog/layer';
import '@/game/fuse/layer';
import '@/game/mechanics/mover/layer';
import '@/game/mechanics/locks/layer';
import '@/game/mechanics/textBlock/model';
