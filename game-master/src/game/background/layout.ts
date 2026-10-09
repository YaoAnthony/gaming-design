// ===== 背景的纯计算（不碰 Phaser，有测试）：每个房间用哪个背景、每层图放多大、人走到哪时挪多少 =====
import { BACKGROUNDS, DEFAULT_BACKGROUND, type BackgroundLayer } from '@/asset/backgrounds';
import type { Floor, RoomCoord, WorldModel } from '@/type';

/** 这个房间用哪个背景：房间单独设了就用房间的，否则用这一层的，都没有用默认的星空。认不出来的 id（改了名、删了）也退回默认 */
export function backgroundOf(floor: Pick<Floor, 'background'>, model: Pick<WorldModel, 'roomBackgrounds'>, roomKey: string): string {
  const id = model.roomBackgrounds?.[roomKey] ?? floor.background ?? DEFAULT_BACKGROUND;
  return BACKGROUNDS.some(b => b.id === id) ? id : DEFAULT_BACKGROUND;
}

/** 这一层所有房间用到的背景 id（去重） */
export function backgroundsOfFloor(floor: Floor): string[] {
  const m = floor.model, out = new Set<string>();
  m.layout.forEach(row => row.forEach(key => { if (key) out.add(backgroundOf(floor, m, key)); }));
  return [...out];
}

/** 当前房间优先，接着四个相邻房间；不抢先下载远处的背景。 */
export function nearbyBackgrounds(floor: Floor, rx: number, ry: number): string[] {
  const ids = [[rx, ry], [rx - 1, ry], [rx + 1, ry], [rx, ry - 1], [rx, ry + 1]]
    .flatMap(([x, y]) => { const key = floor.model.layout[y]?.[x]; return key ? [backgroundOf(floor, floor.model, key)] : []; });
  return [...new Set(ids)];
}

/**
 * 开场在哪个房间（它的背景要在进这一层之前就下好）：给了进场位置 entry（世界像素）就是那个房间，给了 startRoom 就是它，
 * 否则是出生点 P 所在的房间，都没有就是第一个房间。返回房间的 key；这一层一个房间都没有返回 null
 */
export function startRoomKey(
  model: Pick<WorldModel, 'layout' | 'roomW' | 'roomH' | 'entities'>, tile: number,
  start: { entry?: { x: number; y: number } | null; startRoom?: RoomCoord | null },
): string | null {
  const at = (rx: number, ry: number) => model.layout[ry]?.[rx] || null;
  if (start.entry) {
    const k = at(Math.floor(start.entry.x / (model.roomW * tile)), Math.floor(start.entry.y / (model.roomH * tile)));
    if (k) return k;
  }
  if (start.startRoom) {
    const k = at(start.startRoom.rx, start.startRoom.ry);
    if (k) return k;
  }
  const keys = model.layout.flat().filter((k): k is string => !!k);
  return keys.find(k => model.entities?.[k]?.some(row => row.includes('P'))) ?? keys[0] ?? null;
}

/** 图要放多大才能盖住「房间 + 视差留的边」（等比放大，取盖得住的那个比例） */
export function coverScale(imgW: number, imgH: number, roomW: number, roomH: number, layer: Pick<BackgroundLayer, 'parallax'>): number {
  const p = Math.abs(layer.parallax);
  return Math.max((roomW + 2 * p) / imgW, (roomH + p) / imgH);
}

/**
 * 人在房间里的位置 → 这一层的中心比房间中心偏多少（像素）。
 * u, v = 人在房间里的位置（0..1，左上角是 0）；人往右走，图往左挪（远处的东西看起来动得慢）
 */
export function parallaxOffset(u: number, v: number, layer: Pick<BackgroundLayer, 'parallax'>): { dx: number; dy: number } {
  const cu = Math.min(1, Math.max(0, u)) - 0.5, cv = Math.min(1, Math.max(0, v)) - 0.5;
  return { dx: -cu * 2 * layer.parallax, dy: -cv * layer.parallax };
}
