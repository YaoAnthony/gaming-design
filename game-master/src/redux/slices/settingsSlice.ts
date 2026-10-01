// 玩家自己的设置里不属于游戏参数的部分：语言。持久化在 persist.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Lang } from '@/i18n';

export interface SettingsState { lang: Lang }

const initialState: SettingsState = { lang: 'en' };

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setLang(state, action: PayloadAction<Lang>) { state.lang = action.payload; },
  },
});

export const { setLang: setLangSetting } = settingsSlice.actions;
export default settingsSlice.reducer;
