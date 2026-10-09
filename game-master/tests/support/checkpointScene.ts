import type { TerrainHost } from '@/game/terrain/Terrain';

/** Only rendering is stubbed; Terrain/FuseNet and their scheduling algorithms remain real. */
export function checkpointScene() {
  let now = 0;
  const timers: { at: number; cb: () => void; removed: boolean; fired: boolean; remove(): void; getRemaining(): number }[] = [];
  const obj = () => {
    const o: Record<string, unknown> = { x: 0, y: 0, list: [], destroy() {} };
    ['setDepth', 'setScale', 'setBlendMode', 'setTint', 'setAlpha', 'setOrigin', 'setPosition'].forEach(k => { o[k] = () => o; });
    o.add = (c: unknown) => (o.list as unknown[]).push(c);
    return o;
  };
  const layer = { setCollision() {}, putTileAt() { return {}; }, removeTileAt() {}, calculateFacesWithin() {} };
  const scene = {
    make: { tilemap: () => ({ addTilesetImage: () => ({}), createLayer: () => layer }) },
    add: { container: obj, image: obj, circle: obj, particles: obj },
    tweens: { add: () => ({ remove() {} }) },
    time: {
      get now() { return now; },
      delayedCall(ms: number, cb: () => void) {
        const t = { at: now + ms, cb, removed: false, fired: false, remove() { t.removed = true; }, getRemaining() { return Math.max(0, t.at - now); } };
        timers.push(t); return t;
      },
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const t = timers.filter(t => !t.removed && !t.fired && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!t) break;
      now = t.at; t.fired = true; t.cb();
    }
    now = end;
  };
  return { host: { scene } as unknown as TerrainHost, advance };
}
