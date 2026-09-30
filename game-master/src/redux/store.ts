import { configureStore } from '@reduxjs/toolkit';
import configReducer from './slices/configSlice';
import editorReducer, { roomOfStart, type EditorState } from './slices/editorSlice';
import hudReducer from './slices/hudSlice';
import progressReducer from './slices/progressSlice';
import inputReducer from './slices/inputSlice';
import { loadPersisted, schedulePersist } from './persist';
import { DEFAULT_WORLD_HASH } from '@/game/world/defaultWorld';
import type { GameConfig } from '@/type';

const persisted = typeof window !== 'undefined' ? loadPersisted() : {};

function preloadEditor(): EditorState {
  const base = editorReducer(undefined, { type: '@@init' }), saved = persisted.editor ?? {};
  const editor: EditorState = { ...base, ...saved, play: { ...base.play, ...saved.play } };
  // 存下来的项目没带房间（或房间已经不存在）：看那一层出生点所在的房间，而不是默认地图的
  if (saved.project && !saved.room) editor.room = roomOfStart(editor.project.floors[editor.floor].model);
  return editor;
}

const preloadedState: { editor: EditorState; config: GameConfig } = {
  config: { ...configReducer(undefined, { type: '@@init' }), ...(persisted.config ?? {}) },
  editor: preloadEditor(),
};

export const store = configureStore({
  reducer: { config: configReducer, editor: editorReducer, hud: hudReducer, progress: progressReducer, input: inputReducer },
  preloadedState,
  // 撤销栈里存着上百份项目：开发期的不可变 / 可序列化检查每次派发都会整个遍历，画格子会卡。跳过它们（项目本身照样检查）
  middleware: getDefault => getDefault({
    immutableCheck: { ignoredPaths: ['editor.past', 'editor.future'] },
    serializableCheck: { ignoredPaths: ['editor.past', 'editor.future'] },
  }),
});

if (typeof window !== 'undefined') {
  // 只在要存的那几样变了时才写：游戏里每一跳都会派发 HUD 的更新，不能每次都把整个项目序列化一遍
  let last: unknown[] = [];
  store.subscribe(() => {
    const s = store.getState();
    const now = [s.editor.project, s.editor.floor, s.editor.room, s.editor.play, s.config.musicVolume];
    if (now.every((v, i) => v === last[i])) return;
    last = now;
    schedulePersist(() => {
      const t = store.getState();
      return { editor: { project: t.editor.project, floor: t.editor.floor, room: t.editor.room, play: t.editor.play }, config: { musicVolume: t.config.musicVolume }, defaultHash: DEFAULT_WORLD_HASH };
    });
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
