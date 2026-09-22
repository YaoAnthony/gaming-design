// 编辑器状态：地图模型（唯一数据源）、笔刷、当前房间、开关
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomCoord, WorldModel } from '@/type';
import defaultWorld from '@/map/world.json';
import { addCol, addRow, clearChar, findStart, setCell as setModelCell } from '@/game/world/WorldModel';

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

const initialModel = defaultWorld as WorldModel;

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
    setRoomName(state, action: PayloadAction<{ key: string; name: string }>) { state.model.names[action.payload.key] = action.payload.name; state.version++; },
    paintCell(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string; unique?: boolean }>) {
      const { key, x, y, ch, unique } = action.payload;
      if (unique) clearChar(state.model, ch);
      setModelCell(state.model, key, x, y, ch);
      state.version++;
    },
    addLayoutRow(state) { addRow(state.model); state.version++; },
    addLayoutCol(state) { addCol(state.model); state.version++; },
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

export const { setBrush, setRoom, setShowSupport, setRoomName, paintCell, addLayoutRow, addLayoutCol, replaceModel, resetModel } = editorSlice.actions;
export default editorSlice.reducer;
