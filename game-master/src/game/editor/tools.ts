// ===== 地图编辑器的工具注册表：每种画笔（引线、移动标记、钥匙与门、文字、迷雾区……）在自己的文件夹里登记一次 =====
// 登记的东西：物品栏里那一组按钮、点 / 拖一格时派发什么（纯函数，能单测）、编辑器画布上怎么叠加画、画砖块之前要不要改网格。
// EditorScene 和物品栏（ui/editor/Palette.tsx）只遍历这里，不认识具体是哪种工具；砖块和物件是核心的两组，它们自己画。
// 新工具：在拥有它的文件夹里写 editorTool.ts（defineEditorTool），然后在 editor/allTools.ts 加一行 import。
import type Phaser from 'phaser';
import type { UnknownAction } from '@reduxjs/toolkit';
import { Registry } from '@/game/registry/registry';
import type { WorldModel } from '@/type';
import type { EditorState } from '@/redux/slices/editorSlice';

/** 物品栏按钮的图标 */
export type ToolIcon =
  | { kind: 'frame'; frame: number; tint?: number }        // 图集 tiles 的第几帧（tint = 乘一个颜色）
  | { kind: 'class'; className: string; color: number }    // 一个按颜色上色的小方块（app.css 里的 .fuseicon / .keyicon / .swatch）
  | { kind: 'glyph'; text: string; color?: number };       // 一个字符（箭头、⌫）

export interface ToolButton {
  /** 点它选中的画笔（store.editor.brush） */
  brush: string;
  name: string;
  /** 名字下面的小字 */
  sub?: string;
  /** 鼠标悬停的说明 */
  title?: string;
  icon: ToolIcon;
  /** 名字旁边的小 ✕：删掉这一组（先弹窗确认） */
  remove?: { title: string; confirm: { title: string; content: string }; action: UnknownAction };
}

export interface ToolPalette {
  title: string;
  buttons(m: WorldModel, s: EditorState): ToolButton[];
  /** 这一组末尾的「添加」按钮（比如再加一组钥匙与门） */
  add?(m: WorldModel): { label: string; sub: string; disabled: boolean; action: UnknownAction };
  /** 下面的说明 */
  hint?: string;
  /** 下面的开关（比如「显示迷雾区」） */
  toggles?: { label: string; title?: string; checked(s: EditorState): boolean; action(on: boolean): UnknownAction }[];
}

/** 点到的一格 */
export interface CellCtx {
  model: WorldModel;
  state: EditorState;
  /** 当前房间 key */
  key: string;
  x: number;
  y: number;
  brush: string;
  /** 右键：擦 */
  erase: boolean;
}

/** 画一格的结果：要派发的动作；null = 这一格不用变；{ status } = 不能画，状态栏提示原因 */
export type PaintResult = UnknownAction | null | { status: string };

/** 按住拖出的矩形（两角都含） */
export interface RectCtx extends Omit<CellCtx, 'x' | 'y'> { x0: number; y0: number; x1: number; y1: number }

/** 编辑器画布给工具用的东西 */
export interface EditorHost {
  readonly scene: Phaser.Scene;
  readonly T: number;
  /** 砖块的瓦片层（门要按组给瓦片染色） */
  readonly tiles: Phaser.Tilemaps.TilemapLayer;
  /** 建瓦片层用的地图和图集（引线要自己的几层瓦片） */
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly tileset: Phaser.Tilemaps.Tileset;
  model(): WorldModel;
  state(): EditorState;
  /** 当前房间 key；没选中房间是 null */
  key(): string | null;
}

/** 一个工具在编辑器场景里的画面部分（场景建好时 create 一次，场景关了跟着没） */
export interface ToolView {
  /** 画砖块之前：改这一格网格里显示什么（文字方块、门烘进砖块）。grid[y][x] = 砖块字符 */
  prepareGrid?(grid: string[][]): void;
  /** 砖块画完之后：叠加自己的东西。grid = 改过的网格 */
  draw(grid: string[][]): void;
}

export interface EditorTool {
  id: string;
  index: number;
  /** 物品栏里排在第几（砖块是 0、物件是 100，工具排在中间） */
  order: number;
  /** 这个画笔归不归这个工具管 */
  owns(brush: string): boolean;
  palette?: ToolPalette;
  /** 怎么画：cell = 按住拖一格格画（默认）；rect = 按住拖出矩形、松开一次填；click = 只认按下那一下（文字：放一串新字） */
  stroke?: 'cell' | 'rect' | 'click';
  paint?(c: CellCtx): PaintResult;
  paintRect?(c: RectCtx): UnknownAction | null;
  /** 拖矩形时预览框的颜色 */
  rectColor?(brush: string, erase: boolean): number;
  /** 这些编辑器状态变了要重画（比如迷雾区的「显示」开关）：返回一串，变了就重画 */
  viewKey?(s: EditorState): string;
  create?(host: EditorHost): ToolView;
}

export const EditorTools = new Registry<EditorTool>('编辑器工具', false);

export function defineEditorTool(tool: Omit<EditorTool, 'index'>): EditorTool {
  return EditorTools.register({ ...tool, index: 0 });
}

/** 这个画笔归哪个工具管；砖块、物件（核心的两组）返回 undefined */
export const toolOf = (brush: string): EditorTool | undefined => EditorTools.list().find(t => t.owns(brush));

/** 物品栏里的工具组，按 order 排好 */
export const paletteTools = (): EditorTool[] => EditorTools.filter(t => !!t.palette).sort((a, b) => a.order - b.order);

/** 画的结果是不是「不能画，提示原因」 */
export const isStatus = (r: PaintResult): r is { status: string } => !!r && typeof r === 'object' && 'status' in r && !('type' in r);
