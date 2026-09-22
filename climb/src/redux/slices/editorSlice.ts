// 编辑器状态：地图模型（唯一数据源）、笔刷、当前房间、开关
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomCoord, RoomFlags, WorldModel } from '@/type';
import { DEFAULT_WORLD } from '@/game/world/defaultWorld';
import { addRoomAt, clearChar, deleteRoom as deleteModelRoom, findStart, firstRoom, moveRoom as moveModelRoom, positionOf, roomKeyAt, setCell as setModelCell, setFogCell, setFuseCell, setRoomFlags } from '@/game/world/WorldModel';

export interface EditorState {
  model: WorldModel;
  room: RoomCoord;
  brush: string;
  showSupport: boolean;
  /** 每次模型变化 +1，Phaser 场景据此判断要不要重绘 */
  version: number;
}

function roomOfStart(m: WorldModel): RoomCoord {
  const st = findStart(m);
  return st ? { rx: Math.floor(st.x / m.roomW), ry: Math.floor(st.y / m.roomH) } : { rx: 0, ry: 0 };
}

const initialModel = DEFAULT_WORLD;

const initialState: EditorState = {
  model: initialModel,
  room: roomOfStart(initialModel),
  brush: '#',
  showSupport: true,
  version: 0,
};

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setBrush(state, action: PayloadAction<string>) { state.brush = action.payload; },
    setRoom(state, action: PayloadAction<RoomCoord>) { state.room = action.payload; },
    setShowSupport(state, action: PayloadAction<boolean>) { state.showSupport = action.payload; },
    paintCell(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string; unique?: boolean }>) {
      const { key, x, y, ch, unique } = action.payload;
      if (unique) clearChar(state.model, ch);
      setModelCell(state.model, key, x, y, ch);
      state.version++;
    },
    /** 迷雾区画笔：zone 是 '1'-'4'，'.' 擦除 */
    paintFog(state, action: PayloadAction<{ key: string; x: number; y: number; zone: string }>) {
      const { key, x, y, zone } = action.payload;
      setFogCell(state.model, key, x, y, zone);
      state.version++;
    },
    /** 引线画笔 */
    paintFuse(state, action: PayloadAction<{ key: string; x: number; y: number; on: boolean }>) {
      const { key, x, y, on } = action.payload;
      setFuseCell(state.model, key, x, y, on);
      state.version++;
    },
    setRoomFlag(state, action: PayloadAction<{ key: string; flags: Partial<RoomFlags> }>) {
      setRoomFlags(state.model, action.payload.key, action.payload.flags);
      state.version++;
    },
    /** 在任意位置加房间（可以越界，会自动扩展布局），并选中它 */
    addRoom(state, action: PayloadAction<RoomCoord>) {
      const key = addRoomAt(state.model, action.payload.rx, action.payload.ry);
      state.room = positionOf(state.model, key) ?? state.room;
      state.version++;
    },
    /** 拖拽：交换或移动房间；当前选中的房间跟着走 */
    moveRoom(state, action: PayloadAction<{ from: RoomCoord; to: RoomCoord }>) {
      const selected = roomKeyAt(state.model, state.room.rx, state.room.ry);
      moveModelRoom(state.model, action.payload.from, action.payload.to);
      if (selected) state.room = positionOf(state.model, selected) ?? state.room;
      state.version++;
    },
    deleteRoom(state, action: PayloadAction<string>) {
      deleteModelRoom(state.model, action.payload);
      const selected = roomKeyAt(state.model, state.room.rx, state.room.ry);
      if (!selected) state.room = firstRoom(state.model) ?? { rx: 0, ry: 0 };
      state.version++;
    },
    replaceModel(state, action: PayloadAction<WorldModel>) {
      state.model = action.payload;
      state.room = roomOfStart(action.payload);
      state.version++;
    },
    resetModel(state) {
      state.model = JSON.parse(JSON.stringify(initialModel));
      state.room = roomOfStart(state.model);
      state.version++;
    },
  },
});

export const { setBrush, setRoom, setShowSupport, paintCell, paintFog, paintFuse, setRoomFlag, addRoom, moveRoom, deleteRoom, replaceModel, resetModel } = editorSlice.actions;
export default editorSlice.reducer;
