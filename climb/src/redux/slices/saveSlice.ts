// 存档：游戏进房间时自动写，一份即可（Leap Year 式）
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SaveData } from '@/type';

export interface SaveState { current: SaveData | null }

const saveSlice = createSlice({
  name: 'save',
  initialState: { current: null } as SaveState,
  reducers: {
    writeSave(state, action: PayloadAction<Omit<SaveData, 'version' | 'savedAt'>>) {
      state.current = { version: 1, savedAt: Date.now(), ...action.payload };
    },
    clearSave(state) { state.current = null; },
  },
});

export const { writeSave, clearSave } = saveSlice.actions;
export default saveSlice.reducer;
