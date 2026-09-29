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
import handHoldUrl from './hand_hold.png';
import handOpenUrl from './hand_open.png';
import grabHandUrl from './grab_hand.png';
import boomUrl from './boob.mp3';
import bgmUrl from './Pixelated_Coffee.mp3';
import bossMusicUrl from './boss.mp3';
import bossLaughUrl from './boss_laughing.mp3';
import keyPickupUrl from './key_pickup.mp3';
import avatarDefaultUrl from './re/avatar_default.png';
import avatarLaughUrl from './re/avatar_la.png';

export const TILE_SIZE = 32;

/** 图集帧序号（tiles.png 横排） */
/**
 * 墙的手画模板，每张 5×3 格：8 个方向 + 中间（被围住的黑色内部）+ 4 个折角，格子位置见 game/terrain/walls.ts。
 * 游戏里按周围 8 格拼出每块砖（朝外的表面有纹理，被围住的内部是黑的）。现在没有砖这样画；
 * 要用：画好模板放进 asset，import 进来加到这里和 IMAGES，砖块定义里写 wall: WALL_TEXTURES.xxx
 */
export const WALL_TEXTURES = {} as const;

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
  /** 薄木板（只画在格子上面一条，下面透明） */
  plank: 24,
  /** 碎岩（岩石被引线烧过一次之后的样子） */
  crackedRock: 25,
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
  { key: 'hand_hold', url: handHoldUrl },
  { key: 'hand_open', url: handOpenUrl },
];

/**
 * 复活时把玩家放回来的骷髅手（game/core/respawnHand.ts）。两帧同样大小：hold = 捏着玩家，open = 松开。
 * 手臂从贴图左上角伸进来（从右边进场时游戏里会左右翻转）。
 * pinch = 捏合点在贴图里的位置（0~1，相对宽高）：玩家的身体中心就放在这一点。换成手绘图时改这里对上新图
 */
export const RESPAWN_HAND = {
  hold: 'hand_hold',
  open: 'hand_open',
  pinch: [104 / 160, 120 / 160] as [number, number],
  /** 手周围的光雾 / 落地火花的颜色 */
  glow: [0x9b5de5, 0xc77dff, 0x6a2fbf],
  /** 手臂末端那团烟雾（裂隙）的颜色：暗一些，盖住手臂的断口 */
  smoke: [0x3c1a6e, 0x5a2a9a, 0x7b3fc4],
};

/**
 * 第四面墙那只攥住整个画面的骷髅手（ui/crumple，React 里用，不进 Phaser）。手心朝镜头、手臂从左边伸进来。
 * 一张横排的帧条：frames 帧，每帧 frameW × frameH，从张开一路攥成拳头。
 * grip = 拳心在一帧里的位置（0~1，相对宽高）：纸团攥在这里，手伸进来时这一点对准捏住的地方。
 * fistHeight = 握拳那一帧拳头有多高（贴图像素），用来按纸团大小放大手
 */
export const GRAB_HAND = {
  url: grabHandUrl,
  frames: 6, frameW: 380, frameH: 200,
  grip: [248 / 380, 102 / 200] as [number, number],
  fistHeight: 70,
};

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
  { key: 'keyPickup', url: keyPickupUrl },                          // 捡到钥匙（scripts/gen-sfx.sh 合成的，可以换成手工音效）
];

/** 能当背景音乐的曲目 */
export const MUSIC_TRACKS = AUDIO.filter(a => a.music);
/** 层的背景音乐默认用哪首 */
export const DEFAULT_MUSIC = 'bgm';
/** 层的背景音乐设成这个 = 这一层不放音乐 */
export const NO_MUSIC = 'none';
