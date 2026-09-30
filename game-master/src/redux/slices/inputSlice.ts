// 输入设备：玩家最后一次用的是键盘还是手柄（哪种手柄）。所有按键提示按它显示，不写「或」
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PadKind } from '@/game/gamepad';

export type InputDevice = 'keyboard' | PadKind;

export interface InputState {
  /** 最后一次有输入的设备；一开始当键盘 */
  device: InputDevice;
}

const initialState: InputState = { device: 'keyboard' };

const inputSlice = createSlice({
  name: 'input',
  initialState,
  reducers: {
    setDevice(state, action: PayloadAction<InputDevice>) { state.device = action.payload; },
  },
});

export const { setDevice } = inputSlice.actions;
export default inputSlice.reducer;
