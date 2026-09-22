// ===== 资产清单 =====
// PNG 由 scripts/gen-art.mjs 生成；换成手绘美术只要替换文件、保持帧布局即可。
import tilesUrl from './tiles.png';
import playerUrl from './player.png';
import enemyUrl from './enemy.png';
import doorUrl from './door.png';
import sparkUrl from './spark.png';

export const TILE_SIZE = 32;

/** 图集帧序号（tiles.png 横排） */
export const TILE_FRAMES = {
  dirt: 0,
  rock: 1,
  brittle: 2,
  sand: 3,
  spikes: 4,
} as const;

export interface SpriteSheetAsset { key: string; url: string; frameWidth: number; frameHeight: number }
export interface ImageAsset { key: string; url: string }

export const SPRITESHEETS: SpriteSheetAsset[] = [
  { key: 'tiles', url: tilesUrl, frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
];

export const IMAGES: ImageAsset[] = [
  { key: 'player', url: playerUrl },
  { key: 'enemy', url: enemyUrl },
  { key: 'door', url: doorUrl },
  { key: 'spark', url: sparkUrl },
];
