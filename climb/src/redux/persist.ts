// localStorage 持久化：编辑器地图 + 存档
import type { EditorState } from './slices/editorSlice';
import type { SaveState } from './slices/saveSlice';
import { isValidModel } from '@/game/world/WorldModel';

const KEY = 'climb:v1';

export interface PersistedState { editor?: Partial<EditorState>; save?: SaveState }

export function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as PersistedState;
    const out: PersistedState = {};
    if (p.editor?.model && isValidModel(p.editor.model)) out.editor = { model: p.editor.model, room: p.editor.room };
    if (p.save?.current?.version === 1) out.save = p.save;
    return out;
  } catch { return {}; }
}

let timer: number | null = null;
export function schedulePersist(get: () => PersistedState): void {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    try { localStorage.setItem(KEY, JSON.stringify(get())); } catch { /* 隐私模式等 */ }
  }, 300);
}
