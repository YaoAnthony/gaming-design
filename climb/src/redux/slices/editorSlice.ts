// 编辑器状态：项目（多层）、当前层、当前房间、笔刷、开关
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Project, RoomCoord, RoomFlags, TextBlock, WorldModel } from '@/type';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import {
  addRoomAt, addTextBlock as addModelText, clearChar, deleteRoom as deleteModelRoom, findStart, firstRoom, moveRoom as moveModelRoom,
  newFloor, normalizeModel, positionOf, removeTextBlock as removeModelText, roomKeyAt, setCell as setModelCell, setEntityCell, setFogCell,
  setFuseCell, setRoomFlags, updateTextBlock as updateModelText,
} from '@/game/world/WorldModel';

export interface EditorState {
  project: Project;
  /** 当前层的下标 */
  floor: number;
  room: RoomCoord;
  brush: string;
  showSupport: boolean;
  /** 每次模型变化 +1，Phaser 场景据此判断要不要重绘 */
  version: number;
}

/** 当前层的模型 */
export const currentModel = (e: EditorState): WorldModel => e.project.floors[Math.min(e.floor, e.project.floors.length - 1)].model;
export const currentFloor = (e: EditorState) => e.project.floors[Math.min(e.floor, e.project.floors.length - 1)];

function roomOfStart(m: WorldModel): RoomCoord {
  const st = findStart(m);
  return st ? { rx: Math.floor(st.x / m.roomW), ry: Math.floor(st.y / m.roomH) } : (firstRoom(m) ?? { rx: 0, ry: 0 });
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const initialState: EditorState = {
  project: clone(DEFAULT_PROJECT),
  floor: 0,
  room: roomOfStart(DEFAULT_PROJECT.floors[0].model),
  brush: '#',
  showSupport: true,
  version: 0,
};

const m = (state: EditorState) => currentModel(state);

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setBrush(state, action: PayloadAction<string>) { state.brush = action.payload; },
    setRoom(state, action: PayloadAction<RoomCoord>) { state.room = action.payload; },
    setShowSupport(state, action: PayloadAction<boolean>) { state.showSupport = action.payload; },
    paintCell(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string }>) {
      const { key, x, y, ch } = action.payload;
      setModelCell(m(state), key, x, y, ch);
      state.version++;
    },
    /** 物件画笔（出生点 / 怪物 / 终点）：画在物件层，不动底下的砖块；'.' 擦除 */
    paintEntity(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string; unique?: boolean }>) {
      const { key, x, y, ch, unique } = action.payload;
      if (unique) clearChar(m(state), ch);
      setEntityCell(m(state), key, x, y, ch);
      state.version++;
    },
    paintFog(state, action: PayloadAction<{ key: string; x: number; y: number; zone: string }>) {
      const { key, x, y, zone } = action.payload;
      setFogCell(m(state), key, x, y, zone);
      state.version++;
    },
    paintFuse(state, action: PayloadAction<{ key: string; x: number; y: number; on: boolean }>) {
      const { key, x, y, on } = action.payload;
      setFuseCell(m(state), key, x, y, on);
      state.version++;
    },
    setRoomFlag(state, action: PayloadAction<{ key: string; flags: Partial<RoomFlags> }>) {
      setRoomFlags(m(state), action.payload.key, action.payload.flags);
      state.version++;
    },
    // ---- 文字方块 ----
    addText(state, action: PayloadAction<{ key: string; block: TextBlock }>) { addModelText(m(state), action.payload.key, action.payload.block); state.version++; },
    updateText(state, action: PayloadAction<{ key: string; id: string; patch: Partial<TextBlock> }>) { updateModelText(m(state), action.payload.key, action.payload.id, action.payload.patch); state.version++; },
    removeText(state, action: PayloadAction<{ key: string; id: string }>) { removeModelText(m(state), action.payload.key, action.payload.id); state.version++; },
    // ---- 房间 ----
    addRoom(state, action: PayloadAction<RoomCoord>) {
      const key = addRoomAt(m(state), action.payload.rx, action.payload.ry);
      state.room = positionOf(m(state), key) ?? state.room;
      state.version++;
    },
    moveRoom(state, action: PayloadAction<{ from: RoomCoord; to: RoomCoord }>) {
      const selected = roomKeyAt(m(state), state.room.rx, state.room.ry);
      moveModelRoom(m(state), action.payload.from, action.payload.to);
      if (selected) state.room = positionOf(m(state), selected) ?? state.room;
      state.version++;
    },
    deleteRoom(state, action: PayloadAction<string>) {
      deleteModelRoom(m(state), action.payload);
      const selected = roomKeyAt(m(state), state.room.rx, state.room.ry);
      if (!selected) state.room = firstRoom(m(state)) ?? { rx: 0, ry: 0 };
      state.version++;
    },
    // ---- 层 ----
    setFloor(state, action: PayloadAction<number>) {
      state.floor = Math.max(0, Math.min(action.payload, state.project.floors.length - 1));
      state.room = roomOfStart(m(state));
      state.version++;
    },
    addFloor(state, action: PayloadAction<{ name: string; roomW: number; roomH: number }>) {
      state.project.floors.push(newFloor(state.project, action.payload.name, action.payload.roomW, action.payload.roomH));
      state.floor = state.project.floors.length - 1;
      state.room = { rx: 0, ry: 0 };
      state.version++;
    },
    renameFloor(state, action: PayloadAction<{ index: number; name: string }>) { const f = state.project.floors[action.payload.index]; if (f) f.name = action.payload.name; state.version++; },
    deleteFloor(state, action: PayloadAction<number>) {
      if (state.project.floors.length <= 1) return;
      state.project.floors.splice(action.payload, 1);
      state.floor = Math.min(state.floor, state.project.floors.length - 1);
      state.room = roomOfStart(m(state));
      state.version++;
    },
    /** 整个项目替换（载入 / 导入） */
    replaceProject(state, action: PayloadAction<Project>) {
      state.project = action.payload;
      state.project.floors.forEach(f => normalizeModel(f.model));
      state.floor = 0;
      state.room = roomOfStart(m(state));
      state.version++;
    },
  },
});

export const {
  setBrush, setRoom, setShowSupport, paintCell, paintEntity, paintFog, paintFuse, setRoomFlag,
  addText, updateText, removeText, addRoom, moveRoom, deleteRoom, setFloor, addFloor, renameFloor, deleteFloor, replaceProject,
} = editorSlice.actions;
export default editorSlice.reducer;
