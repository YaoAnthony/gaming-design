// localStorage 持久化：编辑器项目（多层）、试玩起始状态、上次写入 / 载入的文件指纹、玩家自己的设置（音量、语言）、玩家的进度（存档）
// 所有要存的东西都经这里，别的地方不直接碰 localStorage
import type { EditorState, PlayLoadout } from './slices/editorSlice';
import type { SettingsState } from './slices/settingsSlice';
import { RUN_VERSION, type GameConfig, type Project, type RoomCoord, type RunState, type WorldModel } from '@/type';
import { EMPTY_RUN } from './slices/runSlice';
import { asProject, roomKeyAt } from '@/game/world/WorldModel';
import { DEFAULT_WORLD_HASH } from '@/game/world/defaultWorld';

const KEY = 'climb:v1';

export interface PersistedState {
  editor?: Partial<EditorState> & { model?: WorldModel };   // model 是旧格式（单层）
  /** 玩家自己的设置（音量） */
  config?: Partial<GameConfig>;
  /** 语言 */
  settings?: Partial<SettingsState>;
  /** 玩家的进度（存档） */
  run?: RunState;
  /** 存这份编辑副本时打包地图的指纹 */
  defaultHash?: string;
}

const isRoom = (r: unknown): r is RoomCoord => !!r && typeof r === 'object' && Number.isInteger((r as RoomCoord).rx) && Number.isInteger((r as RoomCoord).ry);

/** 试玩起始状态：字段不对就丢掉那个字段（用默认值） */
function readLoadout(v: unknown): Partial<PlayLoadout> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>, out: Partial<PlayLoadout> = {};
  if (Number.isInteger(o.stage)) out.stage = o.stage as number;
  if (typeof o.hat === 'boolean') out.hat = o.hat;
  if (typeof o.held === 'string') out.held = o.held;
  return out;
}

/** 存档：版本不对、不是进行中的一局就不要；字段不对的用默认值 */
export function readRun(v: unknown): RunState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.version !== RUN_VERSION || o.active !== true) return undefined;
  const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? n as number : 0);
  const stats = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  const deep = (o.deep && typeof o.deep === 'object' ? o.deep : {}) as Record<string, unknown>;
  const flags = Object.fromEntries(Object.entries(o.flags && typeof o.flags === 'object' ? o.flags : {}).filter(([, on]) => on === true)) as Record<string, true>;
  return {
    ...EMPTY_RUN, active: true,
    realm: o.realm === 'deep' ? 'deep' : 'flat',
    floorId: typeof o.floorId === 'string' ? o.floorId : null,
    room: isRoom(o.room) ? { rx: o.room.rx, ry: o.room.ry } : null,
    stage: count(o.stage), hat: o.hat === true, held: typeof o.held === 'string' ? o.held : null,
    stats: { jumps: count(stats.jumps), destroyed: count(stats.destroyed) },
    flags,
    deep: typeof deep.levelId === 'string' ? { levelId: deep.levelId } : null,
  };
}

export function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as PersistedState;
    const out: PersistedState = {};
    // 线上：打包的地图换了新版本，旧的编辑副本作废（本地开发不动，编辑器里的才是正在改的）
    const stale = import.meta.env.PROD && p.defaultHash !== DEFAULT_WORLD_HASH;
    if (!stale && p.editor) {
      const project: Project | null = asProject(p.editor.project ?? p.editor.model);
      if (project) {
        const floor = Math.max(0, Math.min(Number.isInteger(p.editor.floor) ? p.editor.floor! : 0, project.floors.length - 1));
        // 存下来的房间在这一层不存在了（比如文件被改过）就不要它，编辑器会选出生点所在的房间
        const room = isRoom(p.editor.room) && roomKeyAt(project.floors[floor].model, p.editor.room.rx, p.editor.room.ry) ? p.editor.room : undefined;
        out.editor = { project, floor, ...(room ? { room } : {}) };
      }
    }
    const play = readLoadout(p.editor?.play);
    if (play) out.editor = { ...out.editor, play: play as PlayLoadout };
    if (typeof p.editor?.fileHash === 'string') out.editor = { ...out.editor, fileHash: p.editor.fileHash };
    else { const legacy = localStorage.getItem('climb:fileHash'); if (legacy) out.editor = { ...out.editor, fileHash: legacy }; }   // 旧版单独存的
    if (typeof p.config?.musicVolume === 'number') out.config = { musicVolume: Math.max(0, Math.min(1, p.config.musicVolume)) };
    const lang = p.settings?.lang ?? localStorage.getItem('climb:lang');   // 旧版单独存的
    if (lang === 'zh' || lang === 'en') out.settings = { lang };
    // 线上：打包的地图换了，旧进度里的层和房间可能对不上，作废
    const run = stale ? undefined : readRun(p.run);
    if (run) out.run = run;
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
