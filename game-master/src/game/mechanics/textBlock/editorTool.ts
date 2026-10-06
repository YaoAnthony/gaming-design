// ===== 编辑器工具：文字方块（左键在这一格放一串新字，内容在侧栏改；右键删掉点到的那串）=====
import type Phaser from 'phaser';
import { defineEditorTool } from '@/game/editor/tools';
import { addText, removeText } from '@/redux/slices/editorSlice';
import { nextFloorId } from '@/game/world/WorldModel';
import { layoutText, textSize } from '@/game/world/font';
import { TILE_FRAMES } from '@/asset';
import { Colors, hex } from '@/shared/palette';
import './model';

const BRUSH = 'text';

defineEditorTool({
  id: 'textBlock', order: 30, stroke: 'click',
  owns: brush => brush === BRUSH,
  palette: {
    title: '文字',
    buttons: () => [{
      brush: BRUSH, name: '文字方块', sub: 'text', title: '一串字，每个字母由可炸的砖拼成；全炸完就跳到指定的层。右键删除',
      icon: { kind: 'frame', frame: TILE_FRAMES.letter },
    }],
  },
  paint: ({ model, state, key, x, y, erase }) => {
    const blocks = model.texts?.[key] ?? [];
    if (erase) {
      const hit = blocks.find(b => { const sz = textSize(b.text); return x >= b.x && y >= b.y && x < b.x + sz.w && y < b.y + sz.h; });
      return hit ? removeText({ key, id: hit.id }) : null;
    }
    const next = state.project.floors[state.floor + 1];
    const target = next ? next.id : nextFloorId(state.project);
    return addText({ key, block: { id: 't' + Date.now().toString(36), x, y, text: 'START', tile: '=', target } });
  },
  create: host => {
    const g = host.scene.add.graphics().setDepth(2.6), T = host.T;
    let labels: Phaser.GameObjects.Text[] = [];
    const blocks = () => { const key = host.key(); return key ? host.model().texts?.[key] ?? [] : []; };
    return {
      // 文字方块烘进网格：只占空气格，和游戏里一样
      prepareGrid: grid => blocks().forEach(b => layoutText(b.text, b.x, b.y).forEach(c => { if (grid[c.y]?.[c.x] === '.') grid[c.y][c.x] = b.tile; })),
      // 每串字画个框 + 目标层标签，编辑时能看出边界
      draw: () => {
        const s = host.state();
        g.clear();
        labels.forEach(t => t.destroy()); labels = [];
        blocks().forEach(b => {
          const sz = textSize(b.text);
          g.lineStyle(2, Colors.gold, 0.9);
          g.strokeRect(b.x * T - 2, b.y * T - 2, sz.w * T + 4, sz.h * T + 4);
          const target = s.project.floors.find(f => f.id === b.target);
          labels.push(host.scene.add.text(b.x * T, b.y * T - 16, '→ ' + (target ? target.name : '?'), { fontSize: '12px', color: hex(Colors.gold), backgroundColor: '#141a2ccc', padding: { x: 3, y: 1 } }).setDepth(2.7));
        });
      },
    };
  },
});
