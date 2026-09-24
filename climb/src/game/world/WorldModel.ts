// ===== 世界模型的纯函数：拼图、找出生点、房间增删移动、导出 =====
import type { LockGroup, Locks, CellRef, Floor, Project, RoomCoord, RoomFlags, TextBlock, WorldModel } from '@/type';
import { layoutText } from './font';
import { Entities } from '@/game/registry/registry';

export function cloneModel(m: WorldModel): WorldModel { return JSON.parse(JSON.stringify(m)); }

/** 空位在游戏里是一整块岩石 */
export function solidRoom(w: number, h: number): string[] { return Array.from({ length: h }, () => 'R'.repeat(w)); }

/** 拼成整张地图（字符串数组）。砖块行里若混着旧格式的物件字符，按空气处理 */
export function worldRows(m: WorldModel): string[] {
  const out: string[] = [];
  const solid = solidRoom(m.roomW, m.roomH);
  m.layout.forEach(layoutRow => {
    for (let y = 0; y < m.roomH; y++) out.push(layoutRow.map(k => (k && m.rooms[k] ? stripEntities(m.rooms[k][y]) : solid[y])).join(''));
  });
  return out;
}

const stripEntities = (row: string) => row.replace(/./g, ch => (Entities.has(ch) ? '.' : ch));

/** 迷雾区拼成整张图（'.' = 无区） */
export function fogRows(m: WorldModel): string[] {
  const out: string[] = [];
  const blank = '.'.repeat(m.roomW);
  m.layout.forEach(layoutRow => {
    for (let y = 0; y < m.roomH; y++) out.push(layoutRow.map(k => (k && m.fog?.[k]?.[y]) || blank).join(''));
  });
  return out;
}

export function setFogCell(m: WorldModel, key: string, x: number, y: number, zone: string): void {
  m.fog ??= {};
  m.fog[key] ??= Array.from({ length: m.roomH }, () => '.'.repeat(m.roomW));
  const r = m.fog[key][y];
  m.fog[key][y] = r.substring(0, x) + zone + r.substring(x + 1);
}

const blankRows = (m: WorldModel) => Array.from({ length: m.roomH }, () => '.'.repeat(m.roomW));

/** 物件层拼成整张图（'.' = 无）。砖块行里若还混着旧格式的物件字符（P/M/G），也一并算进来 */
export function entityRows(m: WorldModel): string[] {
  const out: string[] = [];
  const blank = '.'.repeat(m.roomW);
  m.layout.forEach(layoutRow => {
    for (let y = 0; y < m.roomH; y++) out.push(layoutRow.map(k => {
      if (!k) return blank;
      const layer = m.entities?.[k]?.[y] ?? blank;
      const legacy = m.rooms[k]?.[y] ?? blank;
      let row = '';
      for (let x = 0; x < m.roomW; x++) {
        const e = layer[x] ?? '.', t = legacy[x] ?? '.';
        row += e !== '.' ? e : Entities.has(t) ? t : '.';
      }
      return row;
    }).join(''));
  });
  return out;
}

export function setEntityCell(m: WorldModel, key: string, x: number, y: number, ch: string): void {
  m.entities ??= {};
  m.entities[key] ??= blankRows(m);
  const r = m.entities[key][y];
  m.entities[key][y] = r.substring(0, x) + ch + r.substring(x + 1);
}

/** 旧格式迁移：砖块行里混着的物件字符（P/M/G）搬到物件层，原位置变空气。幂等 */
export function normalizeModel(m: WorldModel): WorldModel {
  let moved = false;
  Object.keys(m.rooms).forEach(k => {
    m.rooms[k] = m.rooms[k].map((row, y) => row.replace(/./g, (ch, x) => {
      if (!Entities.has(ch)) return ch;
      setEntityCell(m, k, x, y, ch); moved = true;
      return '.';
    }));
  });
  if (moved && m.entities) Object.keys(m.entities).forEach(k => { if (!m.rooms[k]) delete m.entities![k]; });
  // 迷雾以前是全局开关 + 例外房间，现在是按房间开启：旧标记直接丢掉（默认就是不启用）
  if (m.roomFlags) Object.values(m.roomFlags).forEach(f => { delete f.noFog; });
  return m;
}

// ---------- 文字方块 ----------
export function addTextBlock(m: WorldModel, key: string, block: TextBlock): void {
  m.texts ??= {};
  (m.texts[key] ??= []).push(block);
}
export function updateTextBlock(m: WorldModel, key: string, id: string, patch: Partial<TextBlock>): void {
  const b = m.texts?.[key]?.find(t => t.id === id);
  if (b) Object.assign(b, patch);
}
export function removeTextBlock(m: WorldModel, key: string, id: string): void {
  if (!m.texts?.[key]) return;
  m.texts[key] = m.texts[key].filter(t => t.id !== id);
}

/** 把所有文字方块烘焙进砖块行（只写到空气格、只写在房间内）；返回烘焙后的模型和每个文字块占的世界格子 */
export function bakeTexts(m: WorldModel): { model: WorldModel; blocks: { block: TextBlock; key: string; cells: CellRef[] }[] } {
  const model = cloneModel(m);
  const blocks: { block: TextBlock; key: string; cells: CellRef[] }[] = [];
  if (!model.texts) return { model, blocks };
  Object.entries(model.texts).forEach(([key, list]) => {
    const pos = positionOf(model, key);
    if (!pos || !model.rooms[key]) return;
    list.forEach(block => {
      const cells: CellRef[] = [];
      layoutText(block.text, block.x, block.y).forEach(c => {
        if (c.x < 0 || c.y < 0 || c.x >= model.roomW || c.y >= model.roomH) return;
        const row = model.rooms[key][c.y];
        if (row[c.x] !== '.') return;
        model.rooms[key][c.y] = row.substring(0, c.x) + block.tile + row.substring(c.x + 1);
        cells.push({ x: pos.rx * model.roomW + c.x, y: pos.ry * model.roomH + c.y });
      });
      blocks.push({ block, key, cells });
    });
  });
  return { model, blocks };
}

// ---------- 项目 / 层 ----------
export function isProject(p: unknown): p is Project {
  return !!p && typeof p === 'object' && Array.isArray((p as Project).floors) && (p as Project).floors.every(f => f && typeof f.id === 'string' && isValidModel(f.model));
}

/** 文件里可能是旧的单层地图，也可能是多层项目，统一成项目 */
export function asProject(json: unknown): Project | null {
  if (isProject(json)) { json.floors.forEach(f => normalizeModel(f.model)); return json; }
  if (isValidModel(json)) return { floors: [{ id: 'f1', name: '第 1 层', model: normalizeModel(json) }] };
  return null;
}

export function nextFloorId(p: Project): string {
  let n = p.floors.length + 1;
  while (p.floors.some(f => f.id === 'f' + n)) n++;
  return 'f' + n;
}

export function newFloor(p: Project, name: string, roomW: number, roomH: number): Floor {
  const id = nextFloorId(p);
  const model: WorldModel = { roomW, roomH, layout: [['A']], rooms: { A: emptyRoom(roomW, roomH) } };
  return { id, name: name || `第 ${p.floors.length + 1} 层`, model };
}

export const floorIndex = (p: Project, id: string): number => p.floors.findIndex(f => f.id === id);
export const floorAfter = (p: Project, id: string): Floor | null => p.floors[floorIndex(p, id) + 1] ?? null;

/** 引线层拼成整张图（'.' = 无） */
export function fuseRows(m: WorldModel): string[] {
  const out: string[] = [];
  const blank = '.'.repeat(m.roomW);
  m.layout.forEach(layoutRow => {
    for (let y = 0; y < m.roomH; y++) out.push(layoutRow.map(k => (k && m.fuse?.[k]?.[y]) || blank).join(''));
  });
  return out;
}

export function setFuseCell(m: WorldModel, key: string, x: number, y: number, on: boolean): void {
  m.fuse ??= {};
  m.fuse[key] ??= Array.from({ length: m.roomH }, () => '.'.repeat(m.roomW));
  const r = m.fuse[key][y];
  m.fuse[key][y] = r.substring(0, x) + (on ? 'W' : '.') + r.substring(x + 1);
}

export function setRoomFlags(m: WorldModel, key: string, flags: Partial<RoomFlags>): void {
  m.roomFlags ??= {};
  m.roomFlags[key] = { ...m.roomFlags[key], ...flags };
}

export const worldCols = (m: WorldModel): number => m.layout[0]?.length ?? 0;
export const worldRowsCount = (m: WorldModel): number => m.layout.length;
export const roomKeyAt = (m: WorldModel, rx: number, ry: number): string | null => (m.layout[ry] ?? [])[rx] ?? null;

export function positionOf(m: WorldModel, key: string): RoomCoord | null {
  for (let ry = 0; ry < m.layout.length; ry++) {
    const rx = m.layout[ry].indexOf(key);
    if (rx >= 0) return { rx, ry };
  }
  return null;
}

export function firstRoom(m: WorldModel): RoomCoord | null {
  for (let ry = 0; ry < m.layout.length; ry++) for (let rx = 0; rx < m.layout[ry].length; rx++) if (m.layout[ry][rx]) return { rx, ry };
  return null;
}

export function emptyRoom(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'R' : '.';
    rows.push(s);
  }
  return rows;
}

export function nextRoomKey(m: WorldModel): string {
  for (let i = 0; i < 26; i++) { const k = String.fromCharCode(65 + i); if (!m.rooms[k]) return k; }
  let n = 1; while (m.rooms['R' + n]) n++;
  return 'R' + n;
}

/** 以下函数原地修改 model（供 reducer 使用，Immer 负责不可变） */

/** 保证 (rx, ry) 这个格子存在：越界时向对应方向扩一排 / 一列。返回修正后的坐标 */
export function ensureSlot(m: WorldModel, rx: number, ry: number): RoomCoord {
  const cols = () => worldCols(m);
  while (ry < 0) { m.layout.unshift(Array(cols()).fill(null)); ry++; }
  while (ry >= m.layout.length) m.layout.push(Array(cols()).fill(null));
  while (rx < 0) { m.layout.forEach(r => r.unshift(null)); rx++; }
  while (rx >= cols()) m.layout.forEach(r => r.push(null));
  return { rx, ry };
}

/** 去掉四周整排 / 整列的空位（至少保留 1x1） */
export function trimLayout(m: WorldModel): void {
  const rowEmpty = (r: (string | null)[]) => r.every(k => !k);
  while (m.layout.length > 1 && rowEmpty(m.layout[0])) m.layout.shift();
  while (m.layout.length > 1 && rowEmpty(m.layout[m.layout.length - 1])) m.layout.pop();
  const colEmpty = (c: number) => m.layout.every(r => !r[c]);
  while (worldCols(m) > 1 && colEmpty(0)) m.layout.forEach(r => r.shift());
  while (worldCols(m) > 1 && colEmpty(worldCols(m) - 1)) m.layout.forEach(r => r.pop());
}

/** 在任意位置（可以越界）加一个新房间，返回它的 key */
export function addRoomAt(m: WorldModel, rx: number, ry: number): string {
  const p = ensureSlot(m, rx, ry);
  if (m.layout[p.ry][p.rx]) throw new Error('这个位置已经有房间了');
  const key = nextRoomKey(m);
  m.rooms[key] = emptyRoom(m.roomW, m.roomH);
  m.layout[p.ry][p.rx] = key;
  return key;
}

/** 把 from 的房间挪到 to：to 有房间就交换，是空位就移动；to 可以越界 */
export function moveRoom(m: WorldModel, from: RoomCoord, to: RoomCoord): void {
  const key = roomKeyAt(m, from.rx, from.ry);
  if (!key) return;
  const t = ensureSlot(m, to.rx, to.ry);
  const f = positionOf(m, key)!;               // ensureSlot 可能移动了整张图
  const other = m.layout[t.ry][t.rx];
  m.layout[f.ry][f.rx] = other;
  m.layout[t.ry][t.rx] = key;
  trimLayout(m);
}

export function deleteRoom(m: WorldModel, key: string): void {
  const p = positionOf(m, key);
  if (!p) return;
  m.layout[p.ry][p.rx] = null;
  delete m.rooms[key];
  if (m.fog) delete m.fog[key];
  if (m.fuse) delete m.fuse[key];
  if (m.entities) delete m.entities[key];
  if (m.roomFlags) delete m.roomFlags[key];
  if (m.texts) delete m.texts[key];
  if (m.locks) { delete m.locks.doors[key]; delete m.locks.keys[key]; }
  trimLayout(m);
}

export function setCell(m: WorldModel, key: string, x: number, y: number, ch: string): void {
  const r = m.rooms[key][y];
  m.rooms[key][y] = r.substring(0, x) + ch + r.substring(x + 1);
}

/** 把唯一物件（如出生点）在全图清掉 */
export function clearChar(m: WorldModel, ch: string): void {
  if (!m.entities) return;
  Object.keys(m.entities).forEach(k => { m.entities![k] = m.entities![k].map(r => r.split(ch).join('.')); });
}

/** 找出生点：优先指定房间，其次全图第一个 */
export function findStart(m: WorldModel, prefRoom?: RoomCoord | null): (CellRef & { pref: boolean }) | null {
  const rows = entityRows(m);
  let any: (CellRef & { pref: boolean }) | null = null;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== 'P') return;
    const rx = Math.floor(x / m.roomW), ry = Math.floor(y / m.roomH);
    if (prefRoom && rx === prefRoom.rx && ry === prefRoom.ry && !any?.pref) any = { x, y, pref: true };
    else if (!any) any = { x, y, pref: false };
  }));
  return any;
}

export function isValidModel(m: unknown): m is WorldModel {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return typeof o.roomW === 'number' && typeof o.roomH === 'number' && Array.isArray(o.layout) && !!o.rooms && typeof o.rooms === 'object';
}

// ---------- 钥匙与门 ----------
/** 组的颜色按添加顺序轮着来：蓝 绿 黄 红 紫 橙 粉 白 青 */
export const LOCK_COLORS = [0x4cc9f0, 0x06d6a0, 0xffd166, 0xef476f, 0x9b5de5, 0xff9f1c, 0xff8fab, 0xf1efe6, 0x00b4d8];
export const LOCK_COLOR_NAMES = ['蓝', '绿', '黄', '红', '紫', '橙', '粉', '白', '青'];
/** 门在砖块行里的字符（烘焙时写入，不进物品栏） */
export const DOOR_CHAR = '%';

export function lockGroup(m: WorldModel, id: number): LockGroup | undefined { return m.locks?.groups.find(g => g.id === id); }

/** 加一组：id 取最小没用过的 1-9，颜色按 id 轮 */
export function addLockGroup(m: WorldModel): LockGroup | null {
  const locks: Locks = (m.locks ??= { groups: [], doors: {}, keys: {} });
  let id = 1; while (locks.groups.some(g => g.id === id)) id++;
  if (id > 9) return null;
  const g = { id, color: LOCK_COLORS[(id - 1) % LOCK_COLORS.length] };
  locks.groups.push(g);
  return g;
}

/** 删一组：它的门和钥匙全擦掉 */
export function removeLockGroup(m: WorldModel, id: number): void {
  if (!m.locks) return;
  m.locks.groups = m.locks.groups.filter(g => g.id !== id);
  const ch = String(id);
  [m.locks.doors, m.locks.keys].forEach(layer => Object.keys(layer).forEach(k => { layer[k] = layer[k].map(r => r.split(ch).join('.')); }));
}

function setLockCell(m: WorldModel, layer: 'doors' | 'keys', key: string, x: number, y: number, id: number): void {
  const locks: Locks = (m.locks ??= { groups: [], doors: {}, keys: {} });
  locks[layer][key] ??= Array.from({ length: m.roomH }, () => '.'.repeat(m.roomW));
  const r = locks[layer][key][y];
  locks[layer][key][y] = r.substring(0, x) + (id > 0 ? String(id) : '.') + r.substring(x + 1);
}
export const setDoorCell = (m: WorldModel, key: string, x: number, y: number, id: number): void => setLockCell(m, 'doors', key, x, y, id);
export const setKeyCell = (m: WorldModel, key: string, x: number, y: number, id: number): void => setLockCell(m, 'keys', key, x, y, id);

export interface LockCell extends CellRef { group: number }
/** 门烘进砖块行（只占空气格）；返回门格和钥匙格的世界坐标 + 组号 */
export function bakeLocks(m: WorldModel): { model: WorldModel; doors: LockCell[]; keys: LockCell[] } {
  const model = cloneModel(m);
  const doors: LockCell[] = [], keys: LockCell[] = [];
  const locks = model.locks;
  if (!locks) return { model, doors, keys };
  const valid = new Set(locks.groups.map(g => g.id));
  const scan = (layer: Record<string, string[]>, out: LockCell[], bake: boolean) => {
    Object.entries(layer).forEach(([key, rows]) => {
      const pos = positionOf(model, key);
      if (!pos || !model.rooms[key]) return;
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        const group = Number(ch);
        if (!(group >= 1 && group <= 9) || !valid.has(group)) return;
        if (bake) {
          const r = model.rooms[key][y];
          if (r[x] !== '.') return;
          model.rooms[key][y] = r.substring(0, x) + DOOR_CHAR + r.substring(x + 1);
        }
        out.push({ x: pos.rx * model.roomW + x, y: pos.ry * model.roomH + y, group });
      }));
    });
  };
  scan(locks.doors, doors, true);
  scan(locks.keys, keys, false);
  return { model, doors, keys };
}
