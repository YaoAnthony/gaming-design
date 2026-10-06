// ===== 钥匙与门的地图数据：组（颜色）、门和钥匙两个图层的读写、把门烘进砖块 =====
// 图层本身在 layer.ts 登记（world/layers.ts）；这里是在它上面的操作
import type { CellRef, LockGroup, Locks, WorldModel } from '@/type';
import { Colors } from '@/shared/palette';
import { cloneModel, positionOf } from '@/game/world/WorldModel';
import { setLayerCell } from '@/game/world/layers';
import './layer';

// ---------- 钥匙与门 ----------
/** 组的颜色按添加顺序轮着来：蓝 绿 黄 红 紫 橙 粉 白 青 */
export const LOCK_COLORS = [Colors.sky, Colors.green, Colors.gold, Colors.rose, Colors.violet, Colors.orange, 0xff8fab, Colors.paper, 0x00b4d8];
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

/** 画 / 擦一格门、钥匙（id = 组号，0 = 擦掉）。这一组不存在（删掉了、或者是别的层的）就不写，免得留下看不见的门 / 钥匙 */
export const setDoorCell = (m: WorldModel, key: string, x: number, y: number, id: number): void => { setLayerCell(m, 'doors', key, x, y, id > 0 ? String(id) : '.'); };
export const setKeyCell = (m: WorldModel, key: string, x: number, y: number, id: number): void => { setLayerCell(m, 'keys', key, x, y, id > 0 ? String(id) : '.'); };

export interface LockCell extends CellRef {
  group: number;
  /** 门后面藏着的砖（门画在别的砖上，比如尖刺）：开门后露出来；没有 = 空气 */
  under?: string;
}
/** 门烘进砖块行（盖在什么砖上都行，底下的砖记在 under 里，开门后露出来）；返回门格和钥匙格的世界坐标 + 组号 */
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
        let under: string | undefined;
        if (bake) {
          const r = model.rooms[key][y], cur = r[x];
          if (cur !== '.' && cur !== DOOR_CHAR) under = cur;
          model.rooms[key][y] = r.substring(0, x) + DOOR_CHAR + r.substring(x + 1);
        }
        out.push({ x: pos.rx * model.roomW + x, y: pos.ry * model.roomH + y, group, ...(under ? { under } : {}) });
      }));
    });
  };
  scan(locks.doors, doors, true);
  scan(locks.keys, keys, false);
  return { model, doors, keys };
}
