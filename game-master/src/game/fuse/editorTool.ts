// ===== 编辑器工具：引线（每种颜色一支画笔，左键画、右键只擦这种颜色）=====
import { defineEditorTool } from '@/game/editor/tools';
import { layerCell, layerRows } from '@/game/world/layers';
import { paintLayer, currentModel } from '@/redux/slices/editorSlice';
import { Terrain } from '@/game/terrain/Terrain';
import { TILE_FRAMES } from '@/asset';
import { decodeFuse, encodeFuse, FUSE_CHANNELS, fuseBit, fuseHas } from './channels';
import './layer';

const PREFIX = 'fuse:';

defineEditorTool({
  id: 'fuse', order: 10,
  owns: brush => brush.startsWith(PREFIX),
  palette: {
    title: '引线',
    buttons: () => FUSE_CHANNELS.map(c => ({
      brush: PREFIX + c.id, name: `${c.name}色引线`, sub: c.shatter ? '直接烧碎岩石' : '右键擦除',
      title: `${c.name}色引线：${c.shatter ? '烧到岩石直接烧没，不留碎岩。' : ''}只和${c.name}色的引线相连。和别的颜色交叉也不相通、不一起烧。游戏里所有颜色看起来一样。右键只擦${c.name}色`,
      icon: { kind: 'class', className: 'fuseicon', color: c.color },
    })),
    hint: '引线可以穿过空气和任何砖块。只有两端能点燃，烧到哪格烧哪格：岩石烧一次裂成碎岩，再烧一次才没；紫色引线一次就把岩石烧没。不同颜色互不相连，可以交叉画在同一格。',
  },
  // 左键画这种颜色，右键只擦这种颜色（同一格别的颜色不动）
  paint: ({ model, key, x, y, brush, erase }) => {
    const ch = Number(brush.slice(PREFIX.length)), cur = layerCell(model, 'fuse', key, x, y);
    if (fuseHas(cur, ch) === !erase) return null;
    const mask = erase ? decodeFuse(cur) & ~fuseBit(ch) : decodeFuse(cur) | fuseBit(ch);
    return paintLayer({ layer: 'fuse', key, x, y, ch: encodeFuse(mask) });
  },
  // 按四周连接自动拼贴，编辑器里整条线可见（游戏里只有端点）。掩码用整张大地图算，所以房间边缘的引线会显示成「连到隔壁房间」
  create: host => {
    const layers = FUSE_CHANNELS.map(c => host.map.createBlankLayer('fuse' + c.id, host.tileset, 0, 0)!.setDepth(2.2 + c.id * 0.01));
    return {
      draw: () => {
        const s = host.state(), m = currentModel(s), rows = layerRows(m, 'fuse');
        const ox = s.room.rx * m.roomW, oy = s.room.ry * m.roomH;
        FUSE_CHANNELS.forEach((c, i) => {
          const layer = layers[i];
          // 只看这一种颜色：拼贴按同色邻居算，交叉的别的颜色不会被画成连着
          const world = rows.map(r => [...r].map(ch => (fuseHas(ch, c.id) ? 'W' : '.')));
          for (let y = 0; y < m.roomH; y++) for (let x = 0; x < m.roomW; x++) {
            if (world[oy + y]?.[ox + x] !== 'W') { layer.removeTileAt(x, y); continue; }
            layer.putTileAt(TILE_FRAMES.fuse + Terrain.maskAt(world, ox + x, oy + y), x, y).tint = c.color;
          }
        });
      },
    };
  },
});
