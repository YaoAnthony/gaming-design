// ===== 世界模型的纯函数：拼图、找出生点、房间增删移动、导出 =====
import type { CellRef, RoomCoord, RoomFlags, WorldModel } from '@/type';
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
  return m;
}

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
