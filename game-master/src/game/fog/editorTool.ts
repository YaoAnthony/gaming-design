// ===== 编辑器工具：迷雾区（按住拖出矩形，松开整片填上；右键拖擦掉）=====
import { defineEditorTool } from '@/game/editor/tools';
import { paintLayerRect, setShowFog, currentModel } from '@/redux/slices/editorSlice';
import { FOG_ZONES, FOG_ZONE_COLORS, fogBrush } from './zones';
import './layer';

const PREFIX = 'fog:';

defineEditorTool({
  id: 'fog', order: 50, stroke: 'rect',
  owns: brush => brush.startsWith(PREFIX),
  palette: {
    title: '迷雾区',
    buttons: () => [
      ...FOG_ZONES.map(z => ({
        brush: fogBrush(z), name: `迷雾区 ${z}`, sub: 'fog', title: `迷雾区 ${z}：玩家踏进区内任一格，整个区永久揭开。按住拖出一个矩形，松开整片填上；右键拖擦掉`,
        icon: { kind: 'class' as const, className: 'swatch', color: FOG_ZONE_COLORS[z] },
      })),
      { brush: fogBrush('.'), name: '擦除迷雾区', sub: 'fog', title: '擦掉迷雾区标记：按住拖出矩形，松开整片擦掉（也可以选任意迷雾区后右键拖）', icon: { kind: 'glyph', text: '⌫' } },
    ],
    toggles: [{ label: '显示迷雾区（不影响游戏）', title: '只管编辑器里画不画迷雾区的叠加色，游戏里照旧；选着迷雾画笔时总会画', checked: s => s.showFog, action: on => setShowFog(on) }],
    hint: '迷雾区揭开前伪装成周围的墙，不影响地形，任何房间都能画。',
  },
  paintRect: ({ key, x0, y0, x1, y1, brush, erase }) => paintLayerRect({ layer: 'fog', key, x0, y0, x1, y1, ch: erase ? '.' : brush.slice(PREFIX.length) }),
  rectColor: (brush, erase) => (erase ? 0xffffff : FOG_ZONE_COLORS[brush.slice(PREFIX.length)] ?? 0xffffff),
  viewKey: s => `${s.showFog}|${s.brush.startsWith(PREFIX)}`,
  /**
   * 按区号上色，编辑时能看见，游戏里是黑的。一片连着的同区格子看成一整块：只淡淡铺色，轮廓只画在和别的区 / 没有迷雾的格子相邻的那几条边上。
   * 「显示迷雾区」关掉就不画；选着迷雾画笔时不管开关都画（画的时候总要看见）
   */
  create: host => {
    const g = host.scene.add.graphics().setDepth(2.5), T = host.T;
    return {
      draw: () => {
        const s = host.state(), key = host.key();
        g.clear();
        if (!s.showFog && !s.brush.startsWith(PREFIX)) return;
        const rows = key ? currentModel(s).fog?.[key] : undefined;
        if (!rows) return;
        const zoneAt = (x: number, y: number) => rows[y]?.[x] ?? '.';
        rows.forEach((row, y) => [...row].forEach((z, x) => {
          const color = FOG_ZONE_COLORS[z];
          if (color === undefined) return;
          g.fillStyle(color, 0.22); g.fillRect(x * T, y * T, T, T);
          g.lineStyle(2, color, 0.95);
          const x0 = x * T, y0 = y * T, x1 = x0 + T, y1 = y0 + T;
          if (zoneAt(x, y - 1) !== z) g.lineBetween(x0, y0 + 1, x1, y0 + 1);
          if (zoneAt(x, y + 1) !== z) g.lineBetween(x0, y1 - 1, x1, y1 - 1);
          if (zoneAt(x - 1, y) !== z) g.lineBetween(x0 + 1, y0, x0 + 1, y1);
          if (zoneAt(x + 1, y) !== z) g.lineBetween(x1 - 1, y0, x1 - 1, y1);
        }));
      },
    };
  },
});
