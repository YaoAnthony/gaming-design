import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { GameConfig } from '@/type';
import { DEFAULT_CONFIG } from '@/game/config';

const configSlice = createSlice({
  name: 'config',
  initialState: DEFAULT_CONFIG,
  reducers: {
    setConfig(state, action: PayloadAction<Partial<GameConfig>>) { Object.assign(state, action.payload); },
    resetConfig() { return DEFAULT_CONFIG; },
  },
});

export const { setConfig, resetConfig } = configSlice.actions;
export default configSlice.reducer;
