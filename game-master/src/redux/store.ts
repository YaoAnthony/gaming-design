import { configureStore } from '@reduxjs/toolkit';
import configReducer from './slices/configSlice';
import editorReducer, { roomOfStart, type EditorState } from './slices/editorSlice';
import hudReducer from './slices/hudSlice';
import inputReducer from './slices/inputSlice';
import settingsReducer, { type SettingsState } from './slices/settingsSlice';
import runReducer from './slices/runSlice';
import { createWriter, EDITOR_FORMAT, LEGACY_KEY, loadPersisted, SAVE_FORMAT, type EditorFile, type SaveFile } from './persist';
import { DEFAULT_WORLD_HASH } from '@/game/world/defaultWorld';
import { storage } from '@/platform';
import type { GameConfig, RunState } from '@/type';

/** 只有开发版有地图编辑器：线上版本（网页、桌面）不读也不写编辑器的工作区 */
const WITH_EDITOR = import.meta.env.DEV;
/** 旧版那一整块（只在网页上有） */
const legacyText = (): string | null => { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(LEGACY_KEY); } catch { return null; } };
const persisted = loadPersisted(storage, { mapHash: DEFAULT_WORLD_HASH, withEditor: WITH_EDITOR, dropStale: import.meta.env.PROD, legacy: storage?.kind === 'browser' ? legacyText() : null });

function preloadEditor(): EditorState {
  const base = editorReducer(undefined, { type: '@@init' }), saved = persisted.editor ?? {};
  const editor: EditorState = { ...base, ...saved, play: { ...base.play, ...saved.play } };
  // 存下来的项目没带房间（或房间已经不存在）：看那一层出生点所在的房间，而不是默认地图的
  if (saved.project && !saved.room) editor.room = roomOfStart(editor.project.floors[editor.floor].model);
  return editor;
}

const preloadedState: { editor: EditorState; config: GameConfig; settings: SettingsState; run: RunState } = {
  config: { ...configReducer(undefined, { type: '@@init' }), ...(persisted.config ?? {}) },
  editor: preloadEditor(),
  settings: { ...settingsReducer(undefined, { type: '@@init' }), ...(persisted.settings ?? {}) },
  run: persisted.run ?? runReducer(undefined, { type: '@@init' }),
};

export const store = configureStore({
  reducer: { config: configReducer, editor: editorReducer, hud: hudReducer, input: inputReducer, settings: settingsReducer, run: runReducer },
  preloadedState,
  // 撤销栈里存着上百份项目：开发期的不可变 / 可序列化检查每次派发都会整个遍历，画格子会卡。跳过它们（项目本身照样检查）
  middleware: getDefault => getDefault({
    immutableCheck: { ignoredPaths: ['editor.past', 'editor.future'] },
    serializableCheck: { ignoredPaths: ['editor.past', 'editor.future'] },
  }),
});

if (storage) {
  // 两份各写各的，只在自己那几样变了时才写：游戏里每一跳都会派发 HUD 的更新，不能每次都序列化；
  // 编辑器的工作区（整个项目）很大，玩家的存档很小——存档变了不用把项目再写一遍
  const save = createWriter(storage, 'save', 300), editor = createWriter(storage, 'editor', 300);
  let lastSave: unknown[] = [], lastEditor: unknown[] = [];
  const changed = (now: unknown[], last: unknown[]) => now.some((v, i) => v !== last[i]);
  const persist = () => {
    const s = store.getState();
    const saveNow = [s.run, s.settings.lang, s.config.musicVolume];
    if (changed(saveNow, lastSave)) {
      lastSave = saveNow;
      save.schedule((): SaveFile => {
        const t = store.getState();
        return { format: SAVE_FORMAT, savedAt: new Date().toISOString(), mapHash: DEFAULT_WORLD_HASH, run: t.run, settings: { lang: t.settings.lang, musicVolume: t.config.musicVolume } };
      });
    }
    const editorNow = [s.editor.project, s.editor.floor, s.editor.room, s.editor.play, s.editor.fileHash];
    if (WITH_EDITOR && changed(editorNow, lastEditor)) {
      lastEditor = editorNow;
      editor.schedule((): EditorFile => {
        const t = store.getState().editor;
        return { format: EDITOR_FORMAT, mapHash: DEFAULT_WORLD_HASH, project: t.project, floor: t.floor, room: t.room, play: t.play, fileHash: t.fileHash };
      });
    }
  };
  // 开局先记下读进来的样子：没变就不写（不然每次打开都白写一遍）
  lastSave = [store.getState().run, store.getState().settings.lang, store.getState().config.musicVolume];
  lastEditor = [store.getState().editor.project, store.getState().editor.floor, store.getState().editor.room, store.getState().editor.play, store.getState().editor.fileHash];
  store.subscribe(persist);
  // 从旧版那一整块读出来的：马上按新格式写下来，再把旧的删掉
  const legacy = storage.kind === 'browser' ? legacyText() : null;
  if (legacy && !storage.read('save') && !storage.read('editor')) {
    lastSave = []; lastEditor = [];
    persist(); save.flush(); editor.flush();
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* 删不掉也没关系：有了新的两份就不会再读它 */ }
  }
  // 关页面 / 关窗口之前：还没写的马上写掉
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { save.flush(); editor.flush(); });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
