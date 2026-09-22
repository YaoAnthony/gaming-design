// 打包进来的默认地图（src/map/world.json）及其指纹
import defaultWorld from '@/map/world.json';
import type { WorldModel } from '@/type';

export const DEFAULT_WORLD = defaultWorld as WorldModel;

/** 简单字符串哈希，用来判断打包的地图有没有变 */
export function modelHash(m: WorldModel): string {
  const s = JSON.stringify(m);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export const DEFAULT_WORLD_HASH = modelHash(DEFAULT_WORLD);
