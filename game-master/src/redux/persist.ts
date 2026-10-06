// ===== 持久化：Redux 里要留下来的东西怎么存、怎么读回来 =====
// 分两份存（存在哪由 platform/storage 决定：网页是 localStorage，桌面版是用户数据目录下的文件）：
// - save：玩家的进度（run）+ 玩家自己的设置（语言、音量）。很小，只在检查点、改设置时写；桌面版同步到 Steam 云
// - editor：开发期地图编辑器的工作区（整个项目、当前层 / 房间、试玩起始状态、文件指纹）。只在开发版读写
// 别的地方不直接碰存储；读进来的东西逐个字段检查，不对的丢掉用默认值，坏档不会让游戏起不来。
import type { EditorState, PlayLoadout } from './slices/editorSlice';
import type { SettingsState } from './slices/settingsSlice';
import { RUN_VERSION, type CarryOver, type GameConfig, type Project, type RoomCoord, type RunState, type SolvedFloor, type SolvedRoom } from '@/type';
import { EMPTY_RUN } from './slices/runSlice';
import { jsonCarry } from '@/shared/carry';
import { asProject, roomKeyAt } from '@/game/world/WorldModel';
import type { SaveName, SaveStorage } from '@/platform/storage';
import { isLang } from '@/i18n/langs';

/** 两份文件的格式版本：结构变了就加一，并在 read* 里接住旧版本 */
export const SAVE_FORMAT = 1;
export const EDITOR_FORMAT = 1;
/** 旧版把所有东西塞在一个 localStorage key 里：第一次读到就拆成两份 */
export const LEGACY_KEY = 'climb:v1';

/** 读回来交给 store 的东西（每一样都可能没有） */
export interface PersistedState {
  editor?: Partial<EditorState>;
  /** 玩家自己的设置里属于游戏参数的部分（音量） */
  config?: Partial<GameConfig>;
  /** 语言 */
  settings?: Partial<SettingsState>;
  /** 玩家的进度（存档） */
  run?: RunState;
}

/** save 这一份的样子 */
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  /** 写的时间（ISO）：Steam 云在两台电脑之间冲突时让玩家选，看得出哪个新 */
  savedAt: string;
  /** 存这份时打包地图的指纹：地图更新过，进度里的房间可能对不上 */
  mapHash: string;
  run: RunState;
  settings: { lang: SettingsState['lang']; musicVolume: number };
}

/** editor 这一份的样子 */
export interface EditorFile {
  format: typeof EDITOR_FORMAT;
  /** 存这份编辑副本时打包地图的指纹 */
  mapHash: string;
  project: Project;
  floor: number;
  room: RoomCoord;
  play: PlayLoadout;
  fileHash: string | null;
}

const isRoom = (r: unknown): r is RoomCoord => !!r && typeof r === 'object' && Number.isInteger((r as RoomCoord).rx) && Number.isInteger((r as RoomCoord).ry);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const parse = (text: string | null): unknown => { if (!text) return null; try { return JSON.parse(text); } catch { return null; } };

/** 试玩起始状态：字段不对就丢掉那个字段（用默认值） */
function readLoadout(v: unknown): Partial<PlayLoadout> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>, out: Partial<PlayLoadout> = {};
  if (Number.isInteger(o.stage)) out.stage = o.stage as number;
  if (typeof o.hat === 'boolean') out.hat = o.hat;
  if (typeof o.held === 'string') out.held = o.held;
  return out;
}

/** 第 1 版存档：帽子、手上的道具是单独的字段 → 第 2 版的 carry（帽子机制 id 'hat'、携带机制 id 'carry'） */
function carryOfV1(o: Record<string, unknown>): CarryOver {
  const out: CarryOver = {};
  if (o.hat === true) out.hat = true;
  if (typeof o.held === 'string') out.carry = o.held;
  return out;
}

/** 存档：版本认不出、不是进行中的一局就不要；字段不对的用默认值。旧版本（1）读进来转成现在的样子 */
export function readRun(v: unknown): RunState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if ((o.version !== RUN_VERSION && o.version !== 1) || o.active !== true) return undefined;
  const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? n as number : 0);
  const stats = obj(o.stats), deep = obj(o.deep);
  const flags = Object.fromEntries(Object.entries(obj(o.flags)).filter(([, on]) => on === true)) as Record<string, true>;
  return {
    ...EMPTY_RUN, active: true,
    realm: o.realm === 'deep' ? 'deep' : 'flat',
    floorId: typeof o.floorId === 'string' ? o.floorId : null,
    room: isRoom(o.room) ? { rx: o.room.rx, ry: o.room.ry } : null,
    stage: count(o.stage),
    carry: o.version === 1 ? carryOfV1(o) : jsonCarry(o.carry),
    stats: { jumps: count(stats.jumps), destroyed: count(stats.destroyed) },
    flags,
    deep: typeof deep.levelId === 'string' ? { levelId: deep.levelId } : null,
    solved: readSolved(o.solved),
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 解开过的房间：字段不对的房间 / 层丢掉 */
function readSolved(v: unknown): Record<string, SolvedFloor> {
  const out: Record<string, SolvedFloor> = {};
  Object.entries(obj(v)).forEach(([floorId, f]) => {
    const rooms: Record<string, SolvedRoom> = {};
    Object.entries(obj(obj(f).rooms)).forEach(([key, r]) => {
      const o = obj(r), terrain = strings(o.terrain);
      if (terrain.length) rooms[key] = { terrain, fuse: strings(o.fuse), mechs: obj(o.mechs) };
    });
    out[floorId] = { rooms, nodes: strings(obj(f).nodes) };
  });
  return out;
}

/** 玩家的设置：语言只认已有的几种，音量夹在 0..1 */
function readSettings(v: unknown, out: PersistedState): void {
  const s = obj(v);
  if (typeof s.musicVolume === 'number' && Number.isFinite(s.musicVolume)) out.config = { musicVolume: Math.max(0, Math.min(1, s.musicVolume)) };
  if (isLang(s.lang)) out.settings = { lang: s.lang };
}

/**
 * save 那一份 → 进度和设置。地图更新过（指纹不同）：进度保留，只是不回原来那个房间了，从那一层的出生点开始
 * （层不在了 GameView 会退回第一层）——玩家更新游戏之后进度不会被清掉
 */
export function readSave(v: unknown, mapHash: string): PersistedState {
  const o = obj(v), out: PersistedState = {};
  if (o.format !== SAVE_FORMAT) return out;
  readSettings(o.settings, out);
  const run = readRun(o.run);
  if (run) out.run = o.mapHash === mapHash ? run : { ...run, room: null, solved: {} };
  return out;
}

/**
 * editor 那一份 → 编辑器的工作区。dropStale：打包的地图换了新版本，旧的编辑副本作废（线上用；本地开发时编辑器里的才是正在改的）
 */
export function readEditor(v: unknown, mapHash: string, dropStale: boolean): Partial<EditorState> | undefined {
  const o = obj(v);
  if (o.format !== EDITOR_FORMAT) return undefined;
  const out: Partial<EditorState> = {};
  const project: Project | null = dropStale && o.mapHash !== mapHash ? null : asProject(o.project);
  if (project) {
    const floor = Math.max(0, Math.min(Number.isInteger(o.floor) ? o.floor as number : 0, project.floors.length - 1));
    // 存下来的房间在这一层不存在了（比如文件被改过）就不要它，编辑器会选出生点所在的房间
    const room = isRoom(o.room) && roomKeyAt(project.floors[floor].model, o.room.rx, o.room.ry) ? o.room : undefined;
    Object.assign(out, { project, floor }, room ? { room } : {});
  }
  const play = readLoadout(o.play);
  if (play) out.play = play as PlayLoadout;
  if (typeof o.fileHash === 'string') out.fileHash = o.fileHash;
  return Object.keys(out).length ? out : undefined;
}

/** 旧版的一整块（climb:v1）→ 新的两份。只在新的两份都还没有的时候用一次 */
export function readLegacy(v: unknown, mapHash: string, dropStale: boolean): PersistedState {
  const p = obj(v), editor = obj(p.editor), out: PersistedState = {};
  const stale = dropStale && p.defaultHash !== mapHash;
  // 旧版 editor.model 是单层的地图
  const asEditor = readEditor({ format: EDITOR_FORMAT, mapHash: p.defaultHash, project: editor.project ?? editor.model, floor: editor.floor, room: editor.room, play: editor.play, fileHash: editor.fileHash }, mapHash, dropStale);
  if (asEditor) out.editor = asEditor;
  readSettings({ ...obj(p.settings), musicVolume: obj(p.config).musicVolume }, out);
  const run = readRun(p.run);
  if (run) out.run = stale ? { ...run, room: null, solved: {} } : run;
  return out;
}

export interface LoadOptions {
  /** 打包地图的指纹 */
  mapHash: string;
  /** 要不要读编辑器的工作区（只有开发版有编辑器） */
  withEditor: boolean;
  /** 线上版本：编辑副本和打包地图对不上就作废 */
  dropStale: boolean;
  /** 旧版那一整块的原文（只有网页版有） */
  legacy?: string | null;
}

/** 从存储里读回所有东西。坏了的那一份当作没有 */
export function loadPersisted(storage: Pick<SaveStorage, 'read'> | null, opts: LoadOptions): PersistedState {
  if (!storage) return {};
  const saveText = storage.read('save'), editorText = opts.withEditor ? storage.read('editor') : null;
  if (!saveText && !editorText && opts.legacy) {
    const old = readLegacy(parse(opts.legacy), opts.mapHash, opts.dropStale);
    if (!opts.withEditor) delete old.editor;
    return old;
  }
  const out = readSave(parse(saveText), opts.mapHash);
  const editor = opts.withEditor ? readEditor(parse(editorText), opts.mapHash, opts.dropStale) : undefined;
  return editor ? { ...out, editor } : out;
}

/** 某一份隔一小会再写（连着变好几次只写最后一次）；flush 把还没写的马上写掉（关页面之前） */
export function createWriter(storage: Pick<SaveStorage, 'write'>, name: SaveName, delayMs: number) {
  let pending: (() => unknown) | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (!pending) return;
    const get = pending;
    pending = null;
    storage.write(name, JSON.stringify(get()));
  };
  return {
    schedule(get: () => unknown): void {
      pending = get;
      if (timer === null) timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
