// ===== 世界模型的纯函数：拼图、找出生点、加房间、导出 =====
import type { CellRef, RoomCoord, WorldModel } from '@/type';

export function cloneModel(m: WorldModel): WorldModel { return JSON.parse(JSON.stringify(m)); }

/** 拼成整张地图（字符串数组） */
export function worldRows(m: WorldModel): string[] {
  const out: string[] = [];
  m.layout.forEach(layoutRow => {
    for (let y = 0; y < m.roomH; y++) out.push(layoutRow.map(k => m.rooms[k][y]).join(''));
  });
  return out;
}

export const worldCols = (m: WorldModel): number => m.layout[0].length;
export const roomKeyAt = (m: WorldModel, rx: number, ry: number): string | null => (m.layout[ry] ?? [])[rx] ?? null;
export const roomName = (m: WorldModel, key: string | null): string => (key ? m.names[key] ?? '' : '');

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

/** 以下几个会原地修改 model（供 reducer 使用，Immer 会处理不可变） */
export function addRow(m: WorldModel): void {
  const row = m.layout[0].map(() => { const k = nextRoomKey(m); m.rooms[k] = emptyRoom(m.roomW, m.roomH); m.names[k] = ''; return k; });
  m.layout.push(row);
}

export function addCol(m: WorldModel): void {
  m.layout.forEach(r => { const k = nextRoomKey(m); m.rooms[k] = emptyRoom(m.roomW, m.roomH); m.names[k] = ''; r.push(k); });
}

export function setCell(m: WorldModel, key: string, x: number, y: number, ch: string): void {
  const r = m.rooms[key][y];
  m.rooms[key][y] = r.substring(0, x) + ch + r.substring(x + 1);
}

/** 把唯一物件（如出生点）在全图清掉 */
export function clearChar(m: WorldModel, ch: string): void {
  Object.keys(m.rooms).forEach(k => { m.rooms[k] = m.rooms[k].map(r => r.split(ch).join('.')); });
}

/** 找出生点：优先指定房间，其次全图第一个 */
export function findStart(m: WorldModel, prefRoom?: RoomCoord | null): (CellRef & { pref: boolean }) | null {
  const rows = worldRows(m);
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
