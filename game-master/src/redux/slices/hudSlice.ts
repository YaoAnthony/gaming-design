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
  dialogue: { speaker: string; text: string; avatar?: string; index: number; total: number; /** 自动翻页的剧情对话：不显示 ▸ */ auto?: boolean; /** 放上面还是下面 */ pos?: 'top' | 'bottom' } | null;
  /** 通关画面是不是真的结束（否则可以继续玩） */
  final: boolean;
  /** 通关时是第几关（长大阶段 0/1/2），以及头上有没有帽子：弹窗标题跟着变 */
  wonStage: number;
  wonHat: boolean;
  /** 左上角「当前位置」 */
  place: string;
  /** 手机端按键布局（层机制决定）：jump = ←→ + 跳；dpad = 十字键 + 动作键 */
  controls: 'jump' | 'dpad';
  /** 右上角分数；null = 这一层不显示 */
  score: number | null;
}

const initialState: HudState = { mode: 'idle', playtest: false, roomKey: '', jumps: 0, destroyed: 0, message: null, boss: null, dialogue: null, final: false, wonStage: 0, wonHat: false, place: '', controls: 'jump', score: null };

const hudSlice = createSlice({
  name: 'hud',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<{ mode: GameMode; playtest?: boolean; final?: boolean; stage?: number; hat?: boolean }>) {
      state.mode = action.payload.mode; if (action.payload.playtest !== undefined) state.playtest = action.payload.playtest; state.final = action.payload.final ?? false;
      state.wonStage = action.payload.stage ?? 0; state.wonHat = action.payload.hat ?? false;
    },
    setRoomKey(state, action: PayloadAction<string>) { state.roomKey = action.payload; },
    setStats(state, action: PayloadAction<{ jumps: number; destroyed: number }>) { state.jumps = action.payload.jumps; state.destroyed = action.payload.destroyed; },
    flash(state, action: PayloadAction<{ text: string; color?: string }>) { state.message = { text: action.payload.text, color: action.payload.color ?? '#ffd166', at: Date.now() }; },
    clearMessage(state) { state.message = null; },
    setBoss(state, action: PayloadAction<{ hp: number; max: number } | null>) { state.boss = action.payload; },
    setDialogue(state, action: PayloadAction<HudState['dialogue']>) { state.dialogue = action.payload; },
    setPlace(state, action: PayloadAction<string>) { state.place = action.payload; },
    setControls(state, action: PayloadAction<HudState['controls']>) { state.controls = action.payload; },
    setScore(state, action: PayloadAction<number | null>) { state.score = action.payload; },
  },
});

export const { setMode, setRoomKey, setStats, flash, clearMessage, setBoss, setDialogue, setPlace, setControls, setScore } = hudSlice.actions;
export default hudSlice.reducer;
