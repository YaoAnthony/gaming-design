// 编辑器状态：项目（多层）、当前层、当前房间、笔刷、开关
import { createSlice, original, type PayloadAction } from '@reduxjs/toolkit';
import type { Project, RoomCoord, RoomFlags, TextBlock, WorldModel } from '@/type';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { DEFAULT_MUSIC } from '@/asset';
import { DEFAULT_BACKGROUND } from '@/asset/backgrounds';
import { DEFAULT_FLOOR_MECHANIC } from '@/game/mechanics/define';
import { addRoomAt, fitRoomSize, clearChar, clearRoom as clearModelRoom, resizeRooms, deleteRoom as deleteModelRoom, findStart, firstRoom, moveRoom as moveModelRoom, newFloor, normalizeModel, positionOf, roomKeyAt, setCell as setModelCell, setEntityCell, setRoomBackground as setModelRoomBackground, setRoomFlags } from '@/game/world/WorldModel';
import { addLockGroup as addModelLock, removeLockGroup as removeModelLock, setDoorCell, setKeyCell, lockGroup } from '@/game/mechanics/locks/model';
import { addTextBlock as addModelText, removeTextBlock as removeModelText, updateTextBlock as updateModelText } from '@/game/mechanics/textBlock/model';
import { setFuseCell } from '@/game/fuse/layer';
import { setLayerCell } from '@/game/world/layers';

export interface EditorState {
  project: Project;
  /** 当前层的下标 */
  floor: number;
  room: RoomCoord;
  brush: string;
  showSupport: boolean;
  /** 编辑器里画不画迷雾区的叠加色（只是看，不影响游戏）；选着迷雾画笔时总会画 */
  showFog: boolean;
  /** 每次模型变化 +1，Phaser 场景据此判断要不要重绘 */
  version: number;
  /** 试玩时角色的起始状态（右边栏设置，三种开始方式都用它） */
  play: PlayLoadout;
  /** 正在等你在地图上点一格当试玩起点（「从这层开始」之后） */
  picking: boolean;
  /** 撤销 / 重做栈（不存进 localStorage） */
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  /** 上一次记录撤销点的标签：标签相同的连续操作只记一次（一笔画、连续打字） */
  histTag: string | null;
  /** 上次写入 / 载入 src/map/world.json 时它的指纹：开发期发现文件被别人改了就提醒载入 */
  fileHash: string | null;
}

/** 撤销点：项目 + 当时在看哪一层、哪个房间（撤销后回到改动发生的地方） */
export interface EditorSnapshot { project: Project; floor: number; room: RoomCoord }

/** 最多能撤销几步 */
const HISTORY_LIMIT = 100;

/** 试玩的起始状态：长大阶段（0/1/2 = 第 1/2/3 关）、戴不戴帽子、手上拿什么（'' = 空手，道具 id，或 'key:组号'） */
export interface PlayLoadout { stage: number; hat: boolean; held: string }

/** 当前层的模型 */
export const currentModel = (e: EditorState): WorldModel => e.project.floors[Math.min(e.floor, e.project.floors.length - 1)].model;
export const currentFloor = (e: EditorState) => e.project.floors[Math.min(e.floor, e.project.floors.length - 1)];

/** 进这一层时默认看哪个房间：出生点所在的房间，没有就第一个房间 */
export function roomOfStart(m: WorldModel): RoomCoord {
  const st = findStart(m);
  return st ? { rx: Math.floor(st.x / m.roomW), ry: Math.floor(st.y / m.roomH) } : (firstRoom(m) ?? { rx: 0, ry: 0 });
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const initialState: EditorState = {
  project: clone(DEFAULT_PROJECT),
  floor: 0,
  room: roomOfStart(DEFAULT_PROJECT.floors[0].model),
  brush: 'R',
  showSupport: true,
  showFog: true,
  version: 0,
  play: { stage: 0, hat: false, held: '' },
  picking: false,
  past: [],
  future: [],
  histTag: null,
  fileHash: null,
};

const m = (state: EditorState) => currentModel(state);

/** 当前状态做成撤销点。project 用改动前的原对象（Immer 冻结的），不复制 */
const snapshot = (state: EditorState): EditorSnapshot => ({ project: original(state.project) ?? clone(state.project), floor: state.floor, room: { ...state.room } });

/** 改项目之前调用：存一个撤销点、清掉重做栈。tag 和上一次一样就不重复存 */
function record(state: EditorState, tag: string | null = null): void {
  if (tag !== null && tag === state.histTag) return;
  state.histTag = tag;
  state.past.push(snapshot(state));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
}

/** 撤销 / 重做：换成那个撤销点的项目，回到当时的层和房间 */
function restore(state: EditorState, s: EditorSnapshot): void {
  state.project = s.project;
  state.floor = Math.max(0, Math.min(s.floor, state.project.floors.length - 1));
  state.room = roomKeyAt(m(state), s.room.rx, s.room.ry) ? s.room : roomOfStart(m(state));
  state.histTag = null;
  state.version++;
  validateBrush(state);
}

/** 画笔指向的钥匙 / 门那一组在当前层不存在了（删了组、换了层、撤销）：换回默认画笔，免得接着画出看不见的东西 */
function validateBrush(state: EditorState): void {
  const lock = /^(?:door|key):(\d+)$/.exec(state.brush);
  if (lock && !lockGroup(m(state), Number(lock[1]))) state.brush = initialState.brush;
}

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setBrush(state, action: PayloadAction<string>) { state.brush = action.payload; },
    setRoom(state, action: PayloadAction<RoomCoord>) { state.room = action.payload; },
    setShowSupport(state, action: PayloadAction<boolean>) { state.showSupport = action.payload; },
    setShowFog(state, action: PayloadAction<boolean>) { state.showFog = action.payload; },
    setFileHash(state, action: PayloadAction<string | null>) { state.fileHash = action.payload; },
    paintCell(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string }>) {
      record(state, 'stroke');
      const { key, x, y, ch } = action.payload;
      setModelCell(m(state), key, x, y, ch);
      state.version++;
    },
    /** 物件画笔（出生点 / 怪物 / 终点）：画在物件层，不动底下的砖块；'.' 擦除 */
    paintEntity(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string; unique?: boolean }>) {
      record(state, 'stroke');
      const { key, x, y, ch, unique } = action.payload;
      if (unique) clearChar(m(state), ch);
      setEntityCell(m(state), key, x, y, ch);
      state.version++;
    },
    paintFog(state, action: PayloadAction<{ key: string; x: number; y: number; zone: string }>) {
      record(state, 'stroke');
      const { key, x, y, zone } = action.payload;
      setLayerCell(m(state), 'fog', key, x, y, zone);
      state.version++;
    },
    /** 迷雾区：按住拖出的整个矩形（两角都含）一次填上同一个区号，'.' = 擦掉；一步撤销 */
    paintFogRect(state, action: PayloadAction<{ key: string; x0: number; y0: number; x1: number; y1: number; zone: string }>) {
      record(state, 'stroke');
      const { key, x0, y0, x1, y1, zone } = action.payload;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) setLayerCell(m(state), 'fog', key, x, y, zone);
      state.version++;
    },
    paintFuse(state, action: PayloadAction<{ key: string; x: number; y: number; ch: number; on: boolean }>) {
      record(state, 'stroke');
      const { key, x, y, ch, on } = action.payload;
      setFuseCell(m(state), key, x, y, ch, on);
      state.version++;
    },
    /** 移动标记：ch = 种类字符，'.' = 擦掉 */
    paintMover(state, action: PayloadAction<{ key: string; x: number; y: number; ch: string }>) {
      record(state, 'stroke');
      const { key, x, y, ch } = action.payload;
      setLayerCell(m(state), 'movers', key, x, y, ch);
      state.version++;
    },
    setRoomFlag(state, action: PayloadAction<{ key: string; flags: Partial<RoomFlags> }>) {
      record(state);
      setRoomFlags(m(state), action.payload.key, action.payload.flags);
      state.version++;
    },
    /** 这个房间单独用哪个背景；id = null 跟着这一层 */
    setRoomBackground(state, action: PayloadAction<{ key: string; id: string | null }>) {
      record(state);
      setModelRoomBackground(m(state), action.payload.key, action.payload.id);
      state.version++;
    },
    // ---- 钥匙与门 ----
    addLock(state) { record(state); addModelLock(m(state)); state.version++; },
    removeLock(state, action: PayloadAction<number>) { record(state); removeModelLock(m(state), action.payload); validateBrush(state); state.version++; },
    paintDoor(state, action: PayloadAction<{ key: string; x: number; y: number; id: number }>) { record(state, 'stroke'); const { key, x, y, id } = action.payload; setDoorCell(m(state), key, x, y, id); state.version++; },
    paintKey(state, action: PayloadAction<{ key: string; x: number; y: number; id: number }>) { record(state, 'stroke'); const { key, x, y, id } = action.payload; setKeyCell(m(state), key, x, y, id); state.version++; },
    // ---- 文字方块 ----
    addText(state, action: PayloadAction<{ key: string; block: TextBlock }>) { record(state); addModelText(m(state), action.payload.key, action.payload.block); state.version++; },
    updateText(state, action: PayloadAction<{ key: string; id: string; patch: Partial<TextBlock> }>) { record(state, 'text:' + action.payload.id); updateModelText(m(state), action.payload.key, action.payload.id, action.payload.patch); state.version++; },
    removeText(state, action: PayloadAction<{ key: string; id: string }>) { record(state); removeModelText(m(state), action.payload.key, action.payload.id); state.version++; },
    // ---- 房间 ----
    addRoom(state, action: PayloadAction<RoomCoord>) {
      record(state);
      const key = addRoomAt(m(state), action.payload.rx, action.payload.ry);
      state.room = positionOf(m(state), key) ?? state.room;
      state.version++;
    },
    moveRoom(state, action: PayloadAction<{ from: RoomCoord; to: RoomCoord }>) {
      record(state);
      const selected = roomKeyAt(m(state), state.room.rx, state.room.ry);
      moveModelRoom(m(state), action.payload.from, action.payload.to);
      if (selected) state.room = positionOf(m(state), selected) ?? state.room;
      state.version++;
    },
    deleteRoom(state, action: PayloadAction<string>) {
      record(state);
      deleteModelRoom(m(state), action.payload);
      const selected = roomKeyAt(m(state), state.room.rx, state.room.ry);
      if (!selected) state.room = firstRoom(m(state)) ?? { rx: 0, ry: 0 };
      state.version++;
    },
    /** 清空一个房间：砖块变回四周岩石的空房间，房间里的其它东西都删掉 */
    clearRoom(state, action: PayloadAction<string>) {
      if (!m(state).rooms[action.payload]) return;
      record(state);
      clearModelRoom(m(state), action.payload);
      state.version++;
    },
    // ---- 层 ----
    setFloor(state, action: PayloadAction<number>) {
      state.floor = Math.max(0, Math.min(action.payload, state.project.floors.length - 1));
      state.room = roomOfStart(m(state));
      validateBrush(state);
      state.version++;
    },
    addFloor(state, action: PayloadAction<{ name: string; roomW: number; roomH: number; place?: string; /** 层机制 id；不写 / platform = 默认 */ mode?: string; /** 背景音乐 key / 'none'；不写 = 默认 */ music?: string; /** 背景 id；不写 / 默认那个 = 不存 */ background?: string }>) {
      record(state);
      const size = fitRoomSize(action.payload.roomW, action.payload.roomH, { w: m(state).roomW, h: m(state).roomH });
      const f = newFloor(state.project, action.payload.name, size.w, size.h);
      if (action.payload.place) f.place = action.payload.place;
      if (action.payload.mode && action.payload.mode !== DEFAULT_FLOOR_MECHANIC) f.mode = action.payload.mode;
      if (action.payload.music && action.payload.music !== DEFAULT_MUSIC) f.music = action.payload.music;
      if (action.payload.background && action.payload.background !== DEFAULT_BACKGROUND) f.background = action.payload.background;
      state.project.floors.push(f);
      state.floor = state.project.floors.length - 1;
      state.room = { rx: 0, ry: 0 };
      validateBrush(state);
      state.version++;
    },
    renameFloor(state, action: PayloadAction<{ index: number; name: string; place?: string; mode?: string; music?: string; background?: string; /** 改这一层的房间尺寸（格）：左上角不动，变小从右边和下边裁掉 */ roomW?: number; roomH?: number }>) {
      const f = state.project.floors[action.payload.index];
      if (!f) return;
      record(state);
      const size = fitRoomSize(action.payload.roomW ?? f.model.roomW, action.payload.roomH ?? f.model.roomH, { w: f.model.roomW, h: f.model.roomH });
      if (size.w !== f.model.roomW || size.h !== f.model.roomH) resizeRooms(f.model, size.w, size.h);
      f.name = action.payload.name;
      if (action.payload.place !== undefined) { if (action.payload.place) f.place = action.payload.place; else delete f.place; }
      if (action.payload.mode !== undefined) { if (action.payload.mode && action.payload.mode !== DEFAULT_FLOOR_MECHANIC) f.mode = action.payload.mode; else delete f.mode; }
      if (action.payload.music !== undefined) { if (action.payload.music && action.payload.music !== DEFAULT_MUSIC) f.music = action.payload.music; else delete f.music; }
      if (action.payload.background !== undefined) { if (action.payload.background && action.payload.background !== DEFAULT_BACKGROUND) f.background = action.payload.background; else delete f.background; }
      state.version++;
    },
    deleteFloor(state, action: PayloadAction<number>) {
      if (state.project.floors.length <= 1) return;
      record(state);
      state.project.floors.splice(action.payload, 1);
      // 删的是当前层前面的层：当前层往前挪了一位，下标跟着减一，还看着同一层
      if (action.payload < state.floor) state.floor--;
      state.floor = Math.min(state.floor, state.project.floors.length - 1);
      state.room = roomOfStart(m(state));
      validateBrush(state);
      state.version++;
    },
    /** 整个项目替换（载入 / 导入） */
    setPlayLoadout(state, action: PayloadAction<Partial<PlayLoadout>>) { Object.assign(state.play, action.payload); },
    setPicking(state, action: PayloadAction<boolean>) { state.picking = action.payload; },
    // ---- 撤销 / 重做 ----
    /** 编辑器画布上按下鼠标：新的一笔开始，这一笔画的所有格子算一步撤销 */
    beginStroke(state) { state.histTag = null; },
    undo(state) {
      const s = state.past.pop();
      if (!s) return;
      state.future.push(snapshot(state));
      restore(state, s);
    },
    redo(state) {
      const s = state.future.pop();
      if (!s) return;
      state.past.push(snapshot(state));
      restore(state, s);
    },
    replaceProject(state, action: PayloadAction<Project>) {
      record(state);
      state.project = action.payload;
      state.project.floors.forEach(f => normalizeModel(f.model));
      state.floor = 0;
      state.room = roomOfStart(m(state));
      validateBrush(state);
      state.version++;
    },
  },
});

export const {
  setBrush, setRoom, setShowSupport, setShowFog, setFileHash, paintCell, paintEntity, paintFog, paintFogRect, paintFuse, paintMover, setRoomFlag, setRoomBackground,
  addText, updateText, removeText, addLock, removeLock, paintDoor, paintKey, addRoom, moveRoom, deleteRoom, clearRoom, setFloor, addFloor, renameFloor, deleteFloor, replaceProject, setPlayLoadout, setPicking,
  beginStroke, undo, redo,
} = editorSlice.actions;
export default editorSlice.reducer;
