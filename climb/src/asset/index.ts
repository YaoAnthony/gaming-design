// ===== 资产清单 =====
// PNG 由 scripts/gen-art.mjs 生成；换成手绘美术只要替换文件、保持帧布局即可。
import tilesUrl from './tiles.png';
import playerUrl from './player.png';
import playerMidUrl from './player_mid.png';
import playerTallUrl from './player_tall.png';
import enemyUrl from './enemy.png';
import doorUrl from './door.png';
import sparkUrl from './spark.png';
import fuseNodeUrl from './fusenode.png';
import bossUrl from './boss.png';
import skeletonUrl from './skeleton.png';
import castleUrl from './castle.png';
import candleUrl from './candle.png';
import volumeUrl from './volume.png';
import keyUrl from './key.png';
import pelletUrl from './pellet.png';
import powerUrl from './power.png';
import ghostHouseUrl from './ghosthouse.png';
import grapesUrl from './grapes.png';
import tunnelUrl from './tunnel.png';
import ghostUrl from './ghost.png';
import ghost2Url from './ghost2.png';
import ghostEyesUrl from './ghosteyes.png';
import ghostScaredUrl from './ghostscared.png';
import bombUrl from './bomb.png';
import hatUrl from './hat.png';
import crate1Url from './crate1.png';
import crate2Url from './crate2.png';
import plate1Url from './plate1.png';
import plate2Url from './plate2.png';
import plate1DownUrl from './plate1_down.png';
import plate2DownUrl from './plate2_down.png';
import boomUrl from './boob.mp3';
import bgmUrl from './Pixelated_Coffee.mp3';
import bossMusicUrl from './boss.mp3';
import bossLaughUrl from './boss_laughing.mp3';
import avatarDefaultUrl from './re/avatar_default.png';
import avatarLaughUrl from './re/avatar_la.png';

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
  /** 锁着的门（白底，游戏里按组染色） */
  door: 23,
} as const;

export const AUTOTILE_VARIANTS = 16;

export interface SpriteSheetAsset { key: string; url: string; frameWidth: number; frameHeight: number }
export interface ImageAsset { key: string; url: string }

export const SPRITESHEETS: SpriteSheetAsset[] = [
  { key: 'tiles', url: tilesUrl, frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
];

export const IMAGES: ImageAsset[] = [
  { key: 'player', url: playerUrl },
  /** 长大后的玩家：第 2 关 1.5 格高、第 3 关 2 格高；换成手绘只要覆盖同名文件 */
  { key: 'player_mid', url: playerMidUrl },
  { key: 'player_tall', url: playerTallUrl },
  { key: 'enemy', url: enemyUrl },
  { key: 'door', url: doorUrl },
  { key: 'spark', url: sparkUrl },
  { key: 'fusenode', url: fuseNodeUrl },
  { key: 'boss', url: bossUrl },
  { key: 'skeleton', url: skeletonUrl },
  { key: 'castle', url: castleUrl },
  { key: 'candle', url: candleUrl },
  { key: 'volume', url: volumeUrl },
  { key: 'key', url: keyUrl },
  { key: 'pellet', url: pelletUrl },
  { key: 'power', url: powerUrl },
  { key: 'ghosthouse', url: ghostHouseUrl },
  { key: 'grapes', url: grapesUrl },
  { key: 'tunnel', url: tunnelUrl },
  { key: 'ghost', url: ghostUrl },
  { key: 'hat', url: hatUrl },
  { key: 'crate1', url: crate1Url },
  { key: 'crate2', url: crate2Url },
  { key: 'plate1', url: plate1Url },
  { key: 'plate2', url: plate2Url },
  { key: 'plate1_down', url: plate1DownUrl },
  { key: 'plate2_down', url: plate2DownUrl },
  { key: 'ghost2', url: ghost2Url },
  { key: 'ghosteyes', url: ghostEyesUrl },
  { key: 'ghostscared', url: ghostScaredUrl },
  { key: 'bomb', url: bombUrl },
];

/** 对话框头像（React 里用 URL 显示，不进 Phaser）。同一个角色不同表情 = 不同 key，台词里按句指定 */
export const AVATARS: Record<string, string> = {
  default: avatarDefaultUrl,
  laugh: avatarLaughUrl,
};

/** music = 背景曲的名字：写了就会出现在编辑器「背景音乐」下拉里 */
export interface AudioAsset { key: string; url: string; music?: string }
export const AUDIO: AudioAsset[] = [
  { key: 'boom', url: boomUrl },                                    // 起跳爆炸
  { key: 'bgm', url: bgmUrl, music: 'Pixelated Coffee' },           // 平时的背景音乐（循环）
  { key: 'bossMusic', url: bossMusicUrl, music: 'Boss 战' },        // Boss 战音乐（循环）
  { key: 'bossLaugh', url: bossLaughUrl },                          // 骷髅消失时的笑声
];

/** 能当背景音乐的曲目 */
export const MUSIC_TRACKS = AUDIO.filter(a => a.music);
/** 层的背景音乐默认用哪首 */
export const DEFAULT_MUSIC = 'bgm';
/** 层的背景音乐设成这个 = 这一层不放音乐 */
export const NO_MUSIC = 'none';
