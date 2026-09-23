import { configureStore } from '@reduxjs/toolkit';
import configReducer from './slices/configSlice';
import editorReducer, { type EditorState } from './slices/editorSlice';
import saveReducer, { type SaveState } from './slices/saveSlice';
import hudReducer from './slices/hudSlice';
import { loadPersisted, schedulePersist } from './persist';
import { DEFAULT_WORLD_HASH } from '@/game/world/defaultWorld';

const persisted = typeof window !== 'undefined' ? loadPersisted() : {};

const preloadedState: { editor: EditorState; save: SaveState } = {
  editor: { ...editorReducer(undefined, { type: '@@init' }), ...(persisted.editor ?? {}) },
  save: persisted.save ?? saveReducer(undefined, { type: '@@init' }),
};

export const store = configureStore({
  reducer: { config: configReducer, editor: editorReducer, save: saveReducer, hud: hudReducer },
  preloadedState,
});

if (typeof window !== 'undefined') {
  store.subscribe(() => schedulePersist(() => {
    const s = store.getState();
    return { editor: { project: s.editor.project, floor: s.editor.floor, room: s.editor.room }, save: s.save, defaultHash: DEFAULT_WORLD_HASH };
  }));
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
