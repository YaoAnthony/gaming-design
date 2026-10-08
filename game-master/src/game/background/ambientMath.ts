export const MIST = { scaleX: 6, scaleY: 1.6, speedX: 1.7, speedY: 0.12, alpha: 0.075 };
export const MOTE_COUNT = 6;
const TAU = Math.PI * 2;
const wrap = (n: number) => ((n % 1) + 1) % 1;

export function roomSeed(key: string): number {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return (seed >>> 0) / 4294967296;
}

/** World-aligned mist: adjacent rooms sample the same point at their shared edge. */
export function mistOffset(x: number, y: number, seconds: number): { x: number; y: number } {
  return { x: (x + seconds * MIST.speedX) / MIST.scaleX, y: (y + seconds * MIST.speedY) / MIST.scaleY };
}

/** A fixed pool, independent of frame rate; wrapping fades to zero at room edges. */
export function moteAt(index: number, seed: number, seconds: number): { u: number; v: number; alpha: number } {
  const phase = wrap(seed + index * 0.61803398875);
  const u = wrap(phase + seconds * (0.002 + index * 0.00012));
  const v = wrap(phase * 3.73 - seconds * (0.0018 + index * 0.0001));
  const fade = Math.min(1, u * 14, (1 - u) * 14, v * 12, (1 - v) * 12);
  const pulse = 0.55 + 0.45 * Math.sin(seconds * 0.8 + phase * TAU);
  return { u, v, alpha: 0.24 * fade * fade * pulse };
}
