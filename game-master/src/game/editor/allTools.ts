// ===== 登记所有编辑器工具（副作用导入，见 tools.ts）=====
// 顺序无所谓（物品栏按每个工具的 order 排）；画面叠加的前后也由各工具自己的 depth 定
import '@/game/fuse/editorTool';
import '@/game/mechanics/mover/editorTool';
import '@/game/mechanics/textBlock/editorTool';
import '@/game/mechanics/locks/editorTool';
import '@/game/fog/editorTool';

export { EditorTools, paletteTools, toolOf } from './tools';
