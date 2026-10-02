// 玩家的进度（存档）：结构和规则见 type/run.ts。试玩不写这里
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { RUN_VERSION, type Realm, type RunCheckpoint, type RunState } from '@/type';

export const EMPTY_RUN: RunState = {
  version: RUN_VERSION, active: false, realm: 'flat', floorId: null, room: null,
  stage: 0, hat: false, held: null, stats: { jumps: 0, destroyed: 0 }, flags: {}, deep: null,
};

const runSlice = createSlice({
  name: 'run',
  initialState: EMPTY_RUN,
  reducers: {
    /** 到了一个检查点：记下给的那几样，这一局算开始了 */
    checkpoint(state, action: PayloadAction<RunCheckpoint>) { Object.assign(state, action.payload); state.active = true; },
    /** 人换了世界：跳出画面（带上 3D 关卡）/ 回到画面 */
    setRealm(state, action: PayloadAction<{ realm: Realm; levelId?: string }>) {
      state.realm = action.payload.realm;
      if (action.payload.levelId) state.deep = { levelId: action.payload.levelId };
    },
    setFlag(state, action: PayloadAction<string>) { state.flags[action.payload] = true; },
    /** 这一局结束 / 重新开始：进度清空 */
    clearRun() { return EMPTY_RUN; },
  },
});

export const { checkpoint, setRealm, setFlag, clearRun } = runSlice.actions;
export default runSlice.reducer;
