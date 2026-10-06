// HUD：Phaser 每帧 / 每事件推给 React 的数据
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { EndingChoice } from '@/story/config';

/** 一幕的结局画面：哪一幕、上面有哪几个选项（「继续」被 GM 扔掉之后就没了） */
export interface EndingView { id: 'act1'; choices: EndingChoice[] }

/** opening = 标题画面（骷髅手在搭地图、拍菜单，主角还没出场） */
export type GameMode = 'idle' | 'opening' | 'playing' | 'dead' | 'won';

export interface HudState {
  mode: GameMode;
  playtest: boolean;
  roomKey: string;
  jumps: number;
  destroyed: number;
  message: { text: string; color: string; at: number } | null;
  boss: { hp: number; max: number; /** 一管多少滴：血多的时候分成好几管，一管打空露出下一管 */ per?: number } | null;
  /** 玩家的生命值（左上角的心）；null = 这一层不显示（吃豆人层） */
  hearts: { hp: number; max: number; /** 两滴血一格：满格金色，剩一滴红色，空了是空格（节奏关卡用） */ tiered?: boolean } | null;
  /** Boss 出场过场叠在画面上的那一段：WARNING 警报 / 名字；null = 不显示 */
  bossIntro: 'warning' | 'title' | null;
  dialogue: { speaker: string; text: string; avatar?: string; index: number; total: number; /** 自动翻页的剧情对话：不显示 ▸ */ auto?: boolean; /** 放上面还是下面 */ pos?: 'top' | 'bottom'; /** 同时砸在画面正中的一行大字 */ shout?: string; /** 越说越大（台词用 | 分截） */ grow?: boolean; /** 「思考中」的灰字 */ think?: boolean } | null;
  /** 通关画面是不是真的结束（否则可以继续玩） */
  final: boolean;
  /** 这次通关是哪一幕的结局（story/config.ts 的 ENDINGS）：是的话不弹「通关！」，换成那一幕的庆祝画面；null = 普通通关 */
  ending: EndingView | null;
  /** 关卡编辑器套在游戏画面外面（第二幕：GM 把主角拖进了编辑器）；gm = GM 的化身已经被拖进物品栏 */
  editorShell: { on: boolean; gm: boolean };
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

const initialState: HudState = { mode: 'idle', playtest: false, roomKey: '', jumps: 0, destroyed: 0, message: null, boss: null, bossIntro: null, hearts: null, dialogue: null, final: false, ending: null, editorShell: { on: false, gm: false }, wonStage: 0, wonHat: false, place: '', controls: 'jump', score: null, rhythm: null, whiteout: 0 };

const hudSlice = createSlice({
  name: 'hud',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<{ mode: GameMode; playtest?: boolean; final?: boolean; stage?: number; hat?: boolean; ending?: EndingView | null }>) {
      state.mode = action.payload.mode; if (action.payload.playtest !== undefined) state.playtest = action.payload.playtest; state.final = action.payload.final ?? false;
      state.ending = action.payload.ending ?? null;
      state.wonStage = action.payload.stage ?? 0; state.wonHat = action.payload.hat ?? false;
    },
    setRoomKey(state, action: PayloadAction<string>) { state.roomKey = action.payload; },
    setStats(state, action: PayloadAction<{ jumps: number; destroyed: number }>) { state.jumps = action.payload.jumps; state.destroyed = action.payload.destroyed; },
    flash(state, action: PayloadAction<{ text: string; color?: string }>) { state.message = { text: action.payload.text, color: action.payload.color ?? '#ffd166', at: Date.now() }; },
    clearMessage(state) { state.message = null; },
    setBoss(state, action: PayloadAction<{ hp: number; max: number; per?: number } | null>) { state.boss = action.payload; },
    setBossIntro(state, action: PayloadAction<'warning' | 'title' | null>) { state.bossIntro = action.payload; },
    setHearts(state, action: PayloadAction<{ hp: number; max: number; tiered?: boolean } | null>) { state.hearts = action.payload; },
    setDialogue(state, action: PayloadAction<HudState['dialogue']>) { state.dialogue = action.payload; },
    setPlace(state, action: PayloadAction<string>) { state.place = action.payload; },
    setControls(state, action: PayloadAction<HudState['controls']>) { state.controls = action.payload; },
    setScore(state, action: PayloadAction<number | null>) { state.score = action.payload; },
    setRhythm(state, action: PayloadAction<{ combo: number; judge: 'perfect' | 'good' | 'miss' | null } | null>) {
      state.rhythm = action.payload && { ...action.payload, seq: (state.rhythm?.seq ?? 0) + 1, mode: state.rhythm?.mode ?? null };
    },
    whiteout(state) { state.whiteout++; },
    setEditorShell(state, action: PayloadAction<{ on: boolean; gm: boolean }>) { state.editorShell = action.payload; },
    setRhythmMode(state, action: PayloadAction<string>) { if (state.rhythm) state.rhythm.mode = action.payload; },
  },
});

export const { setMode, setRoomKey, setStats, flash, clearMessage, setBoss, setBossIntro, setHearts, setDialogue, setPlace, setControls, setScore, setRhythm, setRhythmMode, whiteout, setEditorShell } = hudSlice.actions;
export default hudSlice.reducer;
