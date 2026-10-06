// ===== 编辑器工具：移动方块（每种移动一支画笔；只能画在能动的砖上，右键擦掉这一格的任何移动标记）=====
import { defineEditorTool } from '@/game/editor/tools';
import { layerCell } from '@/game/world/layers';
import { paintLayer } from '@/redux/slices/editorSlice';
import { Colors } from '@/shared/palette';
import { canCarry, MOVER_KINDS, moverBrush, moverKind } from './kinds';
import './layer';

const PREFIX = 'mover:';

defineEditorTool({
  id: 'mover', order: 20,
  owns: brush => brush.startsWith(PREFIX),
  palette: {
    title: '移动方块',
    buttons: () => MOVER_KINDS.map(k => ({
      brush: moverBrush(k), name: k.name, sub: '右键擦除', title: k.desc + '。右键擦掉',
      icon: { kind: 'glyph', text: k.axis === 'x' ? '⟷' : '↕', color: k.color },
    })),
    hint: '画在方块上（实心、自己不会掉的砖；沙土、脆岩、纸不行）。相连的同一种标记连同底下的方块一起来回走，任何一格撞到东西就停一下掉头；站在上面的会被带着走。方块被炸没了那一格就不走了，岩石裂成碎岩还在。',
  },
  paint: ({ model, key, x, y, brush, erase }) => {
    const kind = moverKind(brush.slice(PREFIX.length));
    const ch = erase || !kind ? '.' : kind.ch;
    if (layerCell(model, 'movers', key, x, y) === ch) return null;
    if (ch !== '.' && !canCarry(model.rooms[key]?.[y]?.[x])) return { status: `(${x}, ${y})  这里的砖不能移动：要实心、自己不会掉的砖（沙土、脆岩、纸不行）` };
    return paintLayer({ layer: 'movers', key, x, y, ch });
  },
  // 按种类画双向箭头（左右 / 上下）；底下的砖不能动（后来换成了沙土之类）画红叉，游戏里会忽略
  create: host => {
    const g = host.scene.add.graphics().setDepth(2.65), T = host.T;
    return {
      draw: grid => {
        g.clear();
        const key = host.key(), rows = key ? host.model().movers?.[key] : undefined;
        rows?.forEach((row, y) => [...row].forEach((ch, x) => {
          const kind = moverKind(ch);
          if (!kind) return;
          const cx = x * T + T / 2, cy = y * T + T / 2, a = T * 0.32, hd = T * 0.14;
          if (!canCarry(grid[y]?.[x])) {
            g.lineStyle(3, Colors.rose, 0.95);
            g.lineBetween(cx - a, cy - a, cx + a, cy + a); g.lineBetween(cx + a, cy - a, cx - a, cy + a);
            return;
          }
          g.fillStyle(Colors.ink, 0.45); g.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
          g.lineStyle(3, kind.color, 1); g.fillStyle(kind.color, 1);
          if (kind.axis === 'x') {
            g.lineBetween(cx - a, cy, cx + a, cy);
            g.fillTriangle(cx - a - hd, cy, cx - a + hd, cy - hd, cx - a + hd, cy + hd);
            g.fillTriangle(cx + a + hd, cy, cx + a - hd, cy - hd, cx + a - hd, cy + hd);
          } else {
            g.lineBetween(cx, cy - a, cx, cy + a);
            g.fillTriangle(cx, cy - a - hd, cx - hd, cy - a + hd, cx + hd, cy - a + hd);
            g.fillTriangle(cx, cy + a + hd, cx - hd, cy + a - hd, cx + hd, cy + a - hd);
          }
        }));
      },
    };
  },
});
