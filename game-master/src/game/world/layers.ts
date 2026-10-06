// ===== 按房间存的地图数据的注册表 =====
// 地图里除了砖块（rooms）和物件（entities），机制和系统还会按房间存自己的东西：引线、迷雾区、移动标记、门、钥匙、文字方块……
// 每样在这里登记一次，删房间、清空房间、改房间尺寸、拼整张图、画一格就都会带上它，WorldModel 和编辑器不用认识具体是哪一样。
// - 格子图层（defineGridLayer）：每个房间 roomH 行、每行 roomW 个字符，'.' = 空
// - 别的按房间存的数据（defineRoomData）：比如文字方块是一串对象，自己说删房间 / 清空房间 / 改尺寸时怎么办
// 登记写在拥有它的那个文件夹里（机制的 layer.ts、game/fuse、game/fog），然后在 world/allLayers.ts 加一行 import。
// 不依赖任何引擎（纯数据），测试里可以直接用。
import { Registry } from '@/game/registry/registry';
import type { WorldModel } from '@/type';

export interface GridLayerDef {
  id: string;
  index: number;
  /** 这张「房间 key → 行」的表在模型里的位置；create = 没有就建一张空的 */
  table(m: WorldModel, create: true): Record<string, string[]>;
  table(m: WorldModel, create?: false): Record<string, string[]> | undefined;
  /** 能不能往这一层写这个字符（比如门只认存在的组）；不写 = 都能写。'.'（擦掉）总是能写 */
  accepts?(m: WorldModel, ch: string): boolean;
  /** 清空房间时这一层留着（默认删掉） */
  keepOnClear?: boolean;
}

export interface RoomDataDef {
  id: string;
  index: number;
  /** 删掉 / 清空这个房间时：把它在这里的数据删掉 */
  dropRoom(m: WorldModel, key: string): void;
  /** 清空房间时留着（默认删掉） */
  keepOnClear?: boolean;
  /** 改了这一层所有房间的尺寸（左上角不动）：超出范围的东西自己处理；不写 = 不用管 */
  resize?(m: WorldModel, w: number, h: number): void;
}

export const GridLayers = new Registry<GridLayerDef>('格子图层', false);
export const RoomData = new Registry<RoomDataDef>('房间数据', false);

export function defineGridLayer(def: Omit<GridLayerDef, 'index'>): GridLayerDef {
  return GridLayers.register({ ...def, index: 0 } as GridLayerDef);
}

export function defineRoomData(def: Omit<RoomDataDef, 'index'>): RoomDataDef {
  return RoomData.register({ ...def, index: 0 });
}

function layer(id: string): GridLayerDef {
  const d = GridLayers.get(id);
  if (!d) throw new Error(`没有登记这个格子图层：${id}`);
  return d;
}

const blank = (m: WorldModel) => Array.from({ length: m.roomH }, () => '.'.repeat(m.roomW));

/** 这一层在这个房间这一格是什么（没有 = '.'） */
export function layerCell(m: WorldModel, id: string, key: string, x: number, y: number): string {
  return layer(id).table(m)?.[key]?.[y]?.[x] ?? '.';
}

/** 写这一层的一格；accepts 不让写就不写，返回 false */
export function setLayerCell(m: WorldModel, id: string, key: string, x: number, y: number, ch: string): boolean {
  const def = layer(id);
  if (ch !== '.' && def.accepts && !def.accepts(m, ch)) return false;
  const t = def.table(m, true);
  t[key] ??= blank(m);
  const r = t[key][y];
  if (r === undefined || x < 0 || x >= r.length) return false;
  t[key][y] = r.substring(0, x) + ch + r.substring(x + 1);
  return true;
}

/** 这一层拼成整张图（和 worldRows 一样大；没画的房间、空位都是 '.'） */
export function layerRows(m: WorldModel, id: string): string[] {
  const t = layer(id).table(m), out: string[] = [], empty = '.'.repeat(m.roomW);
  m.layout.forEach(row => { for (let y = 0; y < m.roomH; y++) out.push(row.map(k => (k && t?.[k]?.[y]) || empty).join('')); });
  return out;
}

/** 删掉 / 清空一个房间时，每一层、每一样按房间存的数据里它的那一份（clearing = 清空：标了 keepOnClear 的留着） */
export function dropRoomData(m: WorldModel, key: string, clearing: boolean): void {
  GridLayers.list().forEach(d => { if (!(clearing && d.keepOnClear)) { const t = d.table(m); if (t) delete t[key]; } });
  RoomData.list().forEach(d => { if (!(clearing && d.keepOnClear)) d.dropRoom(m, key); });
}

/** 改房间尺寸：每一层的每个房间按新尺寸裁 / 补 '.'（左上角不动），别的数据各自处理 */
export function resizeRoomData(m: WorldModel, w: number, h: number): void {
  const fit = (rows: string[]) => Array.from({ length: h }, (_, y) => (rows[y] ?? '').substring(0, w).padEnd(w, '.'));
  GridLayers.list().forEach(d => { const t = d.table(m); if (t) Object.keys(t).forEach(k => { t[k] = fit(t[k]); }); });
  RoomData.list().forEach(d => d.resize?.(m, w, h));
}
