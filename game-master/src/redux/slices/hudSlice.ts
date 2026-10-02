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
  /** 玩家的生命值（左上角的心）；null = 这一层不显示（吃豆人层） */
  hearts: { hp: number; max: number } | null;
  /** Boss 出场过场叠在画面上的那一段：WARNING 警报 / 名字；null = 不显示 */
  bossIntro: 'warning' | 'title' | null;
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
  /** 节奏关卡：连击数、最近一次判定（seq 每次判定加一，同样的判定连着出也重新闪）；null = 不在节奏关卡里 */
  /** 整个画面闪一下白光（破屏的那一刻）：每闪一次加一 */
  whiteout: number;
  rhythm: { combo: number; judge: 'perfect' | 'good' | 'miss' | null; seq: number; /** 现在是哪种玩法：底下的按键提示跟着换 */ mode: string | null } | null;
}

const initialState: HudState = { mode: 'idle', playtest: false, roomKey: '', jumps: 0, destroyed: 0, message: null, boss: null, bossIntro: null, hearts: null, dialogue: null, final: false, wonStage: 0, wonHat: false, place: '', controls: 'jump', score: null, rhythm: null, whiteout: 0 };

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
    setBossIntro(state, action: PayloadAction<'warning' | 'title' | null>) { state.bossIntro = action.payload; },
    setHearts(state, action: PayloadAction<{ hp: number; max: number } | null>) { state.hearts = action.payload; },
    setDialogue(state, action: PayloadAction<HudState['dialogue']>) { state.dialogue = action.payload; },
    setPlace(state, action: PayloadAction<string>) { state.place = action.payload; },
    setControls(state, action: PayloadAction<HudState['controls']>) { state.controls = action.payload; },
    setScore(state, action: PayloadAction<number | null>) { state.score = action.payload; },
    setRhythm(state, action: PayloadAction<{ combo: number; judge: 'perfect' | 'good' | 'miss' | null } | null>) {
      state.rhythm = action.payload && { ...action.payload, seq: (state.rhythm?.seq ?? 0) + 1, mode: state.rhythm?.mode ?? null };
    },
    whiteout(state) { state.whiteout++; },
    setRhythmMode(state, action: PayloadAction<string>) { if (state.rhythm) state.rhythm.mode = action.payload; },
  },
});

export const { setMode, setRoomKey, setStats, flash, clearMessage, setBoss, setBossIntro, setHearts, setDialogue, setPlace, setControls, setScore, setRhythm, setRhythmMode, whiteout } = hudSlice.actions;
export default hudSlice.reducer;
