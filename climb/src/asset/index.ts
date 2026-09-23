// ===== 资产清单 =====
// PNG 由 scripts/gen-art.mjs 生成；换成手绘美术只要替换文件、保持帧布局即可。
import tilesUrl from './tiles.png';
import playerUrl from './player.png';
import enemyUrl from './enemy.png';
import doorUrl from './door.png';
import sparkUrl from './spark.png';
import fuseNodeUrl from './fusenode.png';
import bossUrl from './boss.png';
import skeletonUrl from './skeleton.png';
import castleUrl from './castle.png';
import boomUrl from './boob.mp3';
import bgmUrl from './Pixelated_Coffee.mp3';
import bossMusicUrl from './boss.mp3';
import bossLaughUrl from './boss_laughing.mp3';
import avatarDefaultUrl from './re/avatar_default.png';

export const TILE_SIZE = 32;

/** 图集帧序号（tiles.png 横排） */
export const TILE_FRAMES = {
  dirt: 0,
  rock: 1,
  brittle: 2,
  sand: 3,
  spikes: 4,
  /** 引线层在编辑器里的自动拼贴起始帧：实际帧 = fuse + 位掩码（上=1 右=2 下=4 左=8），共 16 帧 */
  fuse: 5,
  paper: 21,
  letter: 22,
} as const;

export const AUTOTILE_VARIANTS = 16;

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
  { key: 'fusenode', url: fuseNodeUrl },
  { key: 'boss', url: bossUrl },
  { key: 'skeleton', url: skeletonUrl },
  { key: 'castle', url: castleUrl },
];

/** 对话框头像（React 里用 URL 显示，不进 Phaser）。同一个角色不同表情 = 不同 key，台词里按句指定 */
export const AVATARS: Record<string, string> = {
  default: avatarDefaultUrl,
};

export interface AudioAsset { key: string; url: string }
export const AUDIO: AudioAsset[] = [
  { key: 'boom', url: boomUrl },            // 起跳爆炸
  { key: 'bgm', url: bgmUrl },              // 平时的背景音乐（循环）
  { key: 'bossMusic', url: bossMusicUrl },  // Boss 战音乐（循环）
  { key: 'bossLaugh', url: bossLaughUrl },  // 骷髅消失时的笑声
];
