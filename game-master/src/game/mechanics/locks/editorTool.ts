// ===== 编辑器工具：钥匙与门（每组一种颜色，各一支钥匙画笔、一支门画笔；门画在门层，游戏里烘进砖块；右键擦）=====
import type Phaser from 'phaser';
import { defineEditorTool, type ToolButton } from '@/game/editor/tools';
import { layerCell } from '@/game/world/layers';
import { addLock, paintLayer, removeLock } from '@/redux/slices/editorSlice';
import { Terrain } from '@/game/terrain/Terrain';
import { TILE_FRAMES } from '@/asset';
import type { WorldModel } from '@/type';
import { DOOR_CHAR, LOCK_COLOR_NAMES, LOCK_COLORS, lockGroup } from './model';

const DOOR = 'door:', KEY = 'key:';
/** 最多几组（组号写在格子里是一个字符 1-9） */
const MAX_GROUPS = 9;
const colorName = (c: number) => LOCK_COLOR_NAMES[LOCK_COLORS.indexOf(c)] ?? '';

/** 这一组在这一层所有房间里有几格门、几把钥匙（删组前的确认里写明） */
function countOf(m: WorldModel, id: number): { doors: number; keys: number } {
  const count = (layer: Record<string, string[]> | undefined) => Object.values(layer ?? {}).reduce((n, rows) => n + rows.reduce((k, r) => k + r.split(String(id)).length - 1, 0), 0);
  return { doors: count(m.locks?.doors), keys: count(m.locks?.keys) };
}

defineEditorTool({
  id: 'locks', order: 40,
  owns: brush => brush.startsWith(DOOR) || brush.startsWith(KEY),
  palette: {
    title: '钥匙与门',
    buttons: m => (m.locks?.groups ?? []).flatMap((g): ToolButton[] => {
      const name = colorName(g.color), { doors, keys } = countOf(m, g.id);
      return [
        { brush: KEY + g.id, name: `${name}钥匙`, sub: String(g.id), title: `${name}钥匙：碰到同色的门就开`, icon: { kind: 'class', className: 'keyicon', color: g.color } },
        {
          brush: DOOR + g.id, name: `${name}门`, title: `${name}门：可以盖在别的砖上（比如尖刺），开门后露出来；右键擦`,
          icon: { kind: 'frame', frame: TILE_FRAMES.door, tint: g.color },
          remove: {
            title: '删除这组', action: removeLock(g.id),
            confirm: {
              title: `删除${name}色这一组钥匙和门？`,
              content: doors || keys ? `这一层所有房间里的${name}门（${doors} 格）和${name}钥匙（${keys} 把）会一起删掉。可以撤销。` : '这一组还没画过门和钥匙。可以撤销。',
            },
          },
        },
      ];
    }),
    add: m => ({ label: '添加一组', sub: `${m.locks?.groups.length ?? 0}/${MAX_GROUPS}`, disabled: (m.locks?.groups.length ?? 0) >= MAX_GROUPS, action: addLock() }),
  },
  paint: ({ model, key, x, y, brush, erase }) => {
    const isDoor = brush.startsWith(DOOR), layer = isDoor ? 'doors' : 'keys';
    const id = erase ? 0 : Number(brush.split(':')[1]);
    if ((Number(layerCell(model, layer, key, x, y)) || 0) === id) return null;
    return paintLayer({ layer, key, x, y, ch: id > 0 ? String(id) : '.' });
  },
  create: host => {
    const T = host.T;
    let keyImgs: Phaser.GameObjects.Image[] = [], hiddenImgs: Phaser.GameObjects.Image[] = [];
    /** 门盖住的砖：右下角画个小图标 */
    let hidden: { x: number; y: number; id: string }[] = [];
    const doorRows = () => { const key = host.key(); return key ? host.model().locks?.doors[key] : undefined; };
    return {
      // 门烘进网格（盖在什么砖上都行，和游戏里一样）；盖住的砖记下来
      prepareGrid: grid => {
        const m = host.model();
        hidden = [];
        doorRows()?.forEach((row, y) => [...row].forEach((ch, x) => {
          if (!lockGroup(m, Number(ch)) || grid[y]?.[x] === undefined) return;
          if (grid[y][x] !== '.' && grid[y][x] !== DOOR_CHAR) hidden.push({ x, y, id: grid[y][x] });
          grid[y][x] = DOOR_CHAR;
        }));
      },
      // 门按组染色、盖住的砖画小图标、钥匙画成按组染色的小钥匙
      draw: grid => {
        const m = host.model(), key = host.key();
        doorRows()?.forEach((row, y) => [...row].forEach((ch, x) => {
          const g = lockGroup(m, Number(ch)), t = g && grid[y]?.[x] === DOOR_CHAR ? host.tiles.getTileAt(x, y) : null;
          if (t) t.tint = g!.color;
        }));
        hiddenImgs.forEach(i => i.destroy());
        hiddenImgs = hidden.map(h => host.scene.add.image(h.x * T + T * 0.74, h.y * T + T * 0.74, 'tiles', Terrain.frameOf(h.id, 'editor')).setScale(0.46).setDepth(2.25));
        keyImgs.forEach(i => i.destroy()); keyImgs = [];
        (key ? m.locks?.keys[key] : undefined)?.forEach((row, y) => [...row].forEach((ch, x) => {
          const g = lockGroup(m, Number(ch));
          if (g) keyImgs.push(host.scene.add.image(x * T + T / 2, y * T + T / 2, 'key').setTint(g.color).setDepth(2.4));
        }));
      },
    };
  },
});
