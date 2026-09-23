// localStorage 持久化：编辑器地图 + 存档
import type { EditorState } from './slices/editorSlice';
import type { SaveState } from './slices/saveSlice';
import { isValidModel, normalizeModel } from '@/game/world/WorldModel';
import { DEFAULT_WORLD_HASH } from '@/game/world/defaultWorld';

const KEY = 'climb:v1';

export interface PersistedState { editor?: Partial<EditorState>; save?: SaveState; /** 存这份编辑副本时打包地图的指纹 */ defaultHash?: string }

export function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as PersistedState;
    const out: PersistedState = {};
    // 线上：打包的地图换了新版本，旧的编辑副本作废（本地开发不动，编辑器里的才是正在改的）
    const stale = import.meta.env.PROD && p.defaultHash !== DEFAULT_WORLD_HASH;
    if (!stale && p.editor?.model && isValidModel(p.editor.model)) out.editor = { model: normalizeModel(p.editor.model), room: p.editor.room };
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
