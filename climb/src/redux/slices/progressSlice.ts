// 这一局的进度：打赢过的 Boss 等。按「层 + 关」分开记（第 1 关是第 1 关的，第 2 关是第 2 关的），新开一局清空
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { EntryState, Point } from '@/type';

/** 打赢的 Boss：复活点（封门处）、倒下的位置、Boss 房的 key。之后死在别的房间，就回到这里再炸一次 */
export interface BossWin {
  entry: EntryState;
  at: Point;
  room: string | null;
}

export interface ProgressState {
  /** 键 = progressKey(层 id, 关) */
  bossWins: Record<string, BossWin>;
}

/** 进度按「层 + 关（长大阶段）」分开 */
export const progressKey = (floorId: string, stage: number): string => `${floorId}#${stage}`;

const initialState: ProgressState = { bossWins: {} };

const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    winBoss(state, action: PayloadAction<{ key: string; win: BossWin }>) { state.bossWins[action.payload.key] = action.payload.win; },
    forgetBoss(state, action: PayloadAction<string>) { delete state.bossWins[action.payload]; },
    /** 新开一局（开始游戏 / 再来一次 / 试玩）：之前打过的都不算 */
    resetProgress() { return initialState; },
  },
});

export const { winBoss, forgetBoss, resetProgress } = progressSlice.actions;
export default progressSlice.reducer;
