// HUD：Phaser 每帧 / 每事件推给 React 的数据
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type GameMode = 'idle' | 'playing' | 'dead' | 'won';

export interface HudState {
  mode: GameMode;
  playtest: boolean;
  roomKey: string;
  jumps: number;
  destroyed: number;
  message: { text: string; color: string; at: number } | null;
  boss: { hp: number; max: number } | null;
}

const initialState: HudState = { mode: 'idle', playtest: false, roomKey: '', jumps: 0, destroyed: 0, message: null, boss: null };

const hudSlice = createSlice({
  name: 'hud',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<{ mode: GameMode; playtest?: boolean }>) { state.mode = action.payload.mode; if (action.payload.playtest !== undefined) state.playtest = action.payload.playtest; },
    setRoomKey(state, action: PayloadAction<string>) { state.roomKey = action.payload; },
    setStats(state, action: PayloadAction<{ jumps: number; destroyed: number }>) { state.jumps = action.payload.jumps; state.destroyed = action.payload.destroyed; },
    flash(state, action: PayloadAction<{ text: string; color?: string }>) { state.message = { text: action.payload.text, color: action.payload.color ?? '#ffd166', at: Date.now() }; },
    clearMessage(state) { state.message = null; },
    setBoss(state, action: PayloadAction<{ hp: number; max: number } | null>) { state.boss = action.payload; },
  },
});

export const { setMode, setRoomKey, setStats, flash, clearMessage, setBoss } = hudSlice.actions;
export default hudSlice.reducer;
