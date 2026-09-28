# map

`world.json` 是地图的唯一数据源，用编辑器画，不用手写。开发服务器下点「写入 src/map/world.json」直接写回；打包版本用「导出 world.json」覆盖这个文件。

结构：`{ floors: [{ id, name, place?, mode?, music?, model }] }`，游戏从第一层开始。至少要有一层。

`model` 里每个房间 `roomH` 行、每行 `roomW` 个字符；`layout[ry][rx]` 决定房间怎么拼（`null` = 空位，游戏里是实心岩石），第一行是最上面一排。按房间存的图层：

| 图层 | 内容 |
| --- | --- |
| `rooms` | 砖块字符。注册表在 `game/registry/tiles.ts`，机制自己的砖块在 `game/mechanics/<机制>/index.ts` |
| `entities` | 物件字符（出生点 `P`、怪物 `M`、终点 `G`、小城堡 `T`……），和砖块分开，`.` = 无 |
| `fuse` | 引线颜色位掩码，见 `game/fuse/channels.ts` |
| `fog` | 迷雾区 `1`-`4` |
| `locks` | 钥匙与门的组、门层、钥匙层 |
| `texts` | 文字方块 |
| `roomFlags` | 房间开关（迷雾、吃豆人的左右打通……） |

编辑器物品栏就是注册表的全部内容，每个图标右下角的小字就是地图里的字符。所有泥土 / 脆岩 / 沙土要（经由相邻格子）连到锚点（岩石、泥土等），否则第一次爆炸就会掉；编辑器用红框标出。
