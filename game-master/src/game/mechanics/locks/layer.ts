// 钥匙与门：两个按房间存的格子图层（门 doors、钥匙 keys），'1'-'9' = 组号，'.' = 无。只认存在的组
import { defineGridLayer } from '@/game/world/layers';
import type { Locks, WorldModel } from '@/type';

const locksOf = (m: WorldModel): Locks => (m.locks ??= { groups: [], doors: {}, keys: {} });
const groupExists = (m: WorldModel, ch: string) => !!m.locks?.groups.some(g => String(g.id) === ch);

function doors(m: WorldModel, create: true): Record<string, string[]>;
function doors(m: WorldModel, create?: false): Record<string, string[]> | undefined;
function doors(m: WorldModel, create = false) { return create ? locksOf(m).doors : m.locks?.doors; }
function keys(m: WorldModel, create: true): Record<string, string[]>;
function keys(m: WorldModel, create?: false): Record<string, string[]> | undefined;
function keys(m: WorldModel, create = false) { return create ? locksOf(m).keys : m.locks?.keys; }

export const DOOR_LAYER = defineGridLayer({ id: 'doors', table: doors, accepts: groupExists });
export const KEY_LAYER = defineGridLayer({ id: 'keys', table: keys, accepts: groupExists });
