// ===== 资产清单 =====
// 文件按用途分文件夹：image/（sprite 角色、items 物件、tiles 地形、background 背景、ui 界面、fx 特效；吃豆人的在各自的 pacman/ 下）、
// audio/（音效；剧情界面的在 audio/story/，清单在 storyAudio.ts）、music/（音乐）、font/（字体，app.css 里用）。
// PNG 由 scripts/gen-art.mjs 生成（放哪个文件夹看它的 DIR）；换成手绘美术只要替换文件、保持帧布局即可。
// 主角和怪物例外：主角的动画 player_sheet.png/.json、站姿图 player.png、炸碎用的 player_debris.png/.json 和 fx/player_boom.png/.json，
// 怪物夹子桑的 clip_sheet / clip_back.png/.json 和图标 enemy.png，是从仓库根目录 Aseprite asset/ 里的 .aseprite 导出的
// （导出命令见那里的 generators/boxman.py、generators/clip.py）。
// 砖块（image/tiles/ 下除了 door.png 的全部：tiles.png、拼墙模板 wall_*.png、fusenode.png、特效 tile_*.png）
// 是 Aseprite asset/generators/tiles.py 按 B1 设定集生成的。
import tilesUrl from './image/tiles/tiles.png';
import wallRockUrl from './image/tiles/wall_rock.png';
import wallCrackedUrl from './image/tiles/wall_cracked.png';
import wallBrittleUrl from './image/tiles/wall_brittle.png';
import wallBrittleLooseUrl from './image/tiles/wall_brittle_loose.png';
import wallSandUrl from './image/tiles/wall_sand.png';
import wallPaperUrl from './image/tiles/wall_paper.png';
import wallLetterUrl from './image/tiles/wall_letter.png';
import wallDoorUrl from './image/tiles/wall_door.png';
import tileDebrisUrl from './image/tiles/tile_debris.png';
import tileCrackUrl from './image/tiles/tile_crack.png';
import tileGhostUrl from './image/tiles/tile_ghost.png';
import tileDustUrl from './image/tiles/tile_dust.png';
import playerUrl from './image/sprite/player.png';
import playerSheetUrl from './image/sprite/player_sheet.png';
import playerSheetDataUrl from './image/sprite/player_sheet.json?url';
import playerDebrisUrl from './image/sprite/player_debris.png';
import playerDebrisMeta from './image/sprite/player_debris.json';
import playerBoomUrl from './image/fx/player_boom.png';
import playerBoomDataUrl from './image/fx/player_boom.json?url';
import playerMidUrl from './image/sprite/player_mid.png';
import playerTallUrl from './image/sprite/player_tall.png';
import enemyUrl from './image/sprite/enemy.png';
import clipSheetUrl from './image/sprite/clip_sheet.png';
import clipSheetDataUrl from './image/sprite/clip_sheet.json?url';
import clipBackUrl from './image/sprite/clip_back.png';
import clipBackDataUrl from './image/sprite/clip_back.json?url';
import doorUrl from './image/tiles/door.png';
import sparkUrl from './image/fx/spark.png';
import fuseNodeUrl from './image/tiles/fusenode.png';
import bossUrl from './image/sprite/boss.png';
import skeletonUrl from './image/sprite/skeleton.png';
import skeletonSideUrl from './image/sprite/skeleton_side.png';
import castleUrl from './image/items/castle.png';
import heartFullUrl from './image/ui/heart_full.png';
import heartEmptyUrl from './image/ui/heart_empty.png';
import candleUrl from './image/items/candle.png';
import volumeUrl from './image/items/volume.png';
import keyUrl from './image/items/key.png';
import pelletUrl from './image/items/pacman/pellet.png';
import powerUrl from './image/items/pacman/power.png';
import ghostHouseUrl from './image/items/pacman/ghosthouse.png';
import grapesUrl from './image/items/pacman/grapes.png';
import tunnelUrl from './image/items/pacman/tunnel.png';
import bossTriggerUrl from './image/items/boss_trigger.png';
import ghostUrl from './image/sprite/pacman/ghost.png';
import ghost2Url from './image/sprite/pacman/ghost2.png';
import ghostEyesUrl from './image/sprite/pacman/ghosteyes.png';
import ghostScaredUrl from './image/sprite/pacman/ghostscared.png';
import bombUrl from './image/items/pacman/bomb.png';
import hatUrl from './image/items/hat.png';
import crate1Url from './image/items/crate1.png';
import crate2Url from './image/items/crate2.png';
import plate1Url from './image/items/plate1.png';
import plate2Url from './image/items/plate2.png';
import plate1DownUrl from './image/items/plate1_down.png';
import plate2DownUrl from './image/items/plate2_down.png';
import grabHandUrl from './image/sprite/grab_hand.png';
import gmHandUrl from './image/sprite/gm_hand.png';
import gmArmUrl from './image/sprite/gm_arm.png';
import gmHandModelUrl from './model/gm_hand.glb?url';
import openingMusicUrl from './music/openingMusic.mp3';
import boomUrl from './audio/boob.mp3';
import bgmUrl from './music/Pixelated_Coffee.mp3';
import bossMusicUrl from './music/boss.mp3';
import bossLaughUrl from './audio/boss_laughing.mp3';
import keyPickupUrl from './audio/key_pickup.mp3';
import warningUrl from './audio/warning.mp3';
import avatarDefaultUrl from './image/ui/avatar_default.png';
import avatarLaughUrl from './image/ui/avatar_la.png';

export const TILE_SIZE = 32;

/**
 * 拼墙模板（贴图 key）：每张 4 个相位横排、每个相位 5×3 格（8 个方向 + 中间 + 4 个折角，格子位置见 game/terrain/walls.ts）。
 * 游戏里连在一起的同种砖按周围 8 格拼成一整块（外面一圈边、顶上亮边、里面连续的纹理）；砖块定义里写 wall: WALL_TEXTURES.xxx。
 * 新加一种：tiles.py 里加材料、生成，import 进来加到这里和 IMAGES
 */
export const WALL_TEXTURES = {
  /** 岩石（Boss 封门也用它）：石墨色砌石墙 */
  rock: 'wall_rock',
  /** 碎岩：浅一点、一块块石头裂开 / 缺角 */
  cracked: 'wall_cracked',
  /** 脆岩：吊着的石灰色大板，外角有螺栓 */
  brittle: 'wall_brittle',
  /** 脆岩松脱往下掉的时候：螺栓没了 */
  brittleLoose: 'wall_brittle_loose',
  sand: 'wall_sand',
  /** 纸：米白一沓纸，右上角折角 */
  paper: 'wall_paper',
  /** 字块：淡紫色实心字 */
  letter: 'wall_letter',
  /** 门：白底竖木板门（按钥匙组染色），最上面一排有锁孔 */
  door: 'wall_door',
} as const;

/** 砖块被炸碎时飞出去的碎块（tile_debris.png，12x12 一块）：每种材料一行 4 块，行的顺序是 mats */
export const TILE_DEBRIS = { key: 'tile_debris', size: 12, perMat: 4, mats: ['rock', 'cracked', 'brittle', 'sand', 'paper', 'letter', 'plank', 'spikes'] } as const;
/** 岩石被引线烧裂（tile_crack.png，6 帧 32x32）、炸没之后的虚线空位（tile_ghost.png）、落地扬尘（tile_dust.png，5 帧 16x16） */
export const TILE_FX = { crack: 'tile_crack', crackFrames: 6, ghost: 'tile_ghost', dust: 'tile_dust', dustSize: 16, dustFrames: 5 } as const;

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
  /** 旧的单块木板（现在用 plank 那 16 帧，留着帧号不挪） */
  plankSingle: 24,
  /** 薄木板（只画在格子上面一条，下面透明）：自动拼贴的起始帧，实际帧 = plank + 位掩码（只看 右=2 左=8：两头有节块和支脚），共 16 帧 */
  plank: 30,
  /** 碎岩（岩石被引线烧过一次之后的样子） */
  crackedRock: 25,
  /** 尖刺改挂在旁边：挂左墙（刺朝右）、挂右墙（刺朝左）、两边都挂（缩小一半，每边上下两排） */
  spikesLeft: 26,
  spikesRight: 27,
  spikesBoth: 28,
  /** 王之炸药：史莱姆王死了就炸开周围 3x3 */
  bossCharge: 29,
} as const;

export const AUTOTILE_VARIANTS = 16;
/** tiles.png 一共几帧（横排；界面里按比例缩放这张图时要用） */
export const TILE_ATLAS_FRAMES = 46;

export interface SpriteSheetAsset { key: string; url: string; frameWidth: number; frameHeight: number }
export interface ImageAsset { key: string; url: string }
/** Aseprite 导出的图 + JSON（json-array、带标签、帧名是 {frame}）：游戏里每个标签就是一段动画 */
export interface AsepriteAsset { key: string; url: string; dataUrl: string }

/**
 * 主角的动画：idle / run / jump（jump 里再分 jump_rise / jump_apex / jump_fall）/ hang（被骷髅手捏着后背挣扎）/ getup（放下坐地、爬起来），
 * 用法见 sprite/Player.ts；hero_boom = 炸碎时胸口那团闪光和烟（game/core/heroShatter.ts）
 */
export const ASEPRITES: AsepriteAsset[] = [
  { key: 'hero', url: playerSheetUrl, dataUrl: playerSheetDataUrl },
  { key: 'hero_boom', url: playerBoomUrl, dataUrl: playerBoomDataUrl },
  /** 怪物夹子桑：clip_walk / clip_attack / clip_carry；clip_back = 夹纸时纸后面那一层（见 sprite/Enemy.ts） */
  { key: 'clip', url: clipSheetUrl, dataUrl: clipSheetDataUrl },
  { key: 'clip_back', url: clipBackUrl, dataUrl: clipBackDataUrl },
];

/**
 * 主角炸碎的碎块：站姿按关节拆成的 12 块，一块一格（cell x cell，碎块在格子正中），从后往前排。
 * x / y = 格子中心在 40x40 主角帧里的位置（相对脚底中点，像素）；w / h = 碎块本身多大；chest = 炸点
 */
export interface DebrisPiece { name: string; w: number; h: number; x: number; y: number }
export const HERO_DEBRIS = { key: 'hero_debris', ...(playerDebrisMeta as { cell: number; chest: [number, number]; pieces: DebrisPiece[] }) };

export const SPRITESHEETS: SpriteSheetAsset[] = [
  { key: 'tiles', url: tilesUrl, frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  { key: TILE_DEBRIS.key, url: tileDebrisUrl, frameWidth: TILE_DEBRIS.size, frameHeight: TILE_DEBRIS.size },
  { key: TILE_FX.crack, url: tileCrackUrl, frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  { key: TILE_FX.dust, url: tileDustUrl, frameWidth: TILE_FX.dustSize, frameHeight: TILE_FX.dustSize },
  { key: HERO_DEBRIS.key, url: playerDebrisUrl, frameWidth: HERO_DEBRIS.cell, frameHeight: HERO_DEBRIS.cell },
];

export const IMAGES: ImageAsset[] = [
  /** 主角站姿第一帧（和动画帧一样 40x40）：编辑器图标、剧情演出、3D 世界用这张静态图 */
  { key: 'player', url: playerUrl },
  /** 长大后的玩家：第 2 关 1.5 格高、第 3 关 2 格高；换成手绘只要覆盖同名文件 */
  { key: 'player_mid', url: playerMidUrl },
  { key: 'player_tall', url: playerTallUrl },
  /** 夹子桑走路第一帧（和动画帧一样 40x40）：编辑器图标 */
  { key: 'enemy', url: enemyUrl },
  { key: 'door', url: doorUrl },
  { key: WALL_TEXTURES.rock, url: wallRockUrl },
  { key: WALL_TEXTURES.cracked, url: wallCrackedUrl },
  { key: WALL_TEXTURES.brittle, url: wallBrittleUrl },
  { key: WALL_TEXTURES.brittleLoose, url: wallBrittleLooseUrl },
  { key: WALL_TEXTURES.sand, url: wallSandUrl },
  { key: WALL_TEXTURES.paper, url: wallPaperUrl },
  { key: WALL_TEXTURES.letter, url: wallLetterUrl },
  { key: WALL_TEXTURES.door, url: wallDoorUrl },
  { key: TILE_FX.ghost, url: tileGhostUrl },
  { key: 'spark', url: sparkUrl },
  { key: 'fusenode', url: fuseNodeUrl },
  { key: 'boss', url: bossUrl },
  { key: 'skeleton', url: skeletonUrl },
  /** 骷髅的侧面（脸朝左）：节奏关卡里弹钢琴的 Game Master */
  { key: 'skeleton_side', url: skeletonSideUrl },
  { key: 'castle', url: castleUrl },
  { key: 'candle', url: candleUrl },
  { key: 'volume', url: volumeUrl },
  { key: 'key', url: keyUrl },
  { key: 'pellet', url: pelletUrl },
  { key: 'power', url: powerUrl },
  { key: 'ghosthouse', url: ghostHouseUrl },
  { key: 'grapes', url: grapesUrl },
  { key: 'tunnel', url: tunnelUrl },
  { key: 'bossTrigger', url: bossTriggerUrl },   // Boss 触发点（只在编辑器里显示）
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

/** 复活时把主角放回来的那只手（game/core/respawnHand.ts；手本身是 3D 的木手，在界面那一层画）：手周围的光雾 / 落地火花的颜色 */
export const RESPAWN_HAND = {
  glow: [0x9b5de5, 0xc77dff, 0x6a2fbf],
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

/**
 * Game Master 的骷髅手（主线剧情里那只：开场搭地图、拍标题、指着菜单、揉掉「继续」按钮、拉出关卡编辑器……React 里用）。
 * 横排 4 帧，每帧 frameW × frameH，手臂从左边伸进来、指尖朝右：张开 / 指着 / 捏着 / 握拳（顺序和 HandPose 一致）。
 * tip = 指尖（指着那一帧）、pinch = 捏合点（捏着那一帧）、palm = 手心：在一帧里的位置（0~1），手按这一点对准目标
 */
/**
 * 3D 模型（three.js 里用）。gmHand = Game Master 的木手：骨架、四个姿势的动画、对准点都在模型里；
 * 源文件（.blend）和建模 / 导出脚本在仓库根目录的 3D asset/gm_hand/，改了模型用那里的 export_glb.py 重新导出
 */
export const MODELS = { gmHand: gmHandModelUrl };

export const GM_HAND = {
  url: gmHandUrl,
  /** 一小段前臂（16 × frameH），在手的左边横向平铺：手伸到画面中间时手臂一直接到画面外 */
  armUrl: gmArmUrl,
  frames: ['open', 'point', 'pinch', 'fist'] as const,
  frameW: 380, frameH: 200,
  tip: [348 / 380, 66 / 200] as [number, number],
  pinch: [300 / 380, 84 / 200] as [number, number],
  palm: [250 / 380, 100 / 200] as [number, number],
};

/** 对话框头像（React 里用 URL 显示，不进 Phaser）。同一个角色不同表情 = 不同 key，台词里按句指定 */
/** 左上角生命值的心（HUD 里放大显示，像素风） */
export const HEART_ICONS = { full: heartFullUrl, empty: heartEmptyUrl };

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
  { key: 'warning', url: warningUrl },                              // Boss 出场前的 WARNING 警报（过场里循环放）
  { key: 'openingMusic', url: openingMusicUrl, music: '开场' },      // 标题画面（scripts/gen-story-audio.mjs 合成的占位曲）
];

/** 能当背景音乐的曲目 */
export const MUSIC_TRACKS = AUDIO.filter(a => a.music);
/** 层的背景音乐默认用哪首 */
export const DEFAULT_MUSIC = 'bgm';
/** 层的背景音乐设成这个 = 这一层不放音乐 */
export const NO_MUSIC = 'none';
