import { discoverBackgroundFolders, type BackgroundFolderOptions } from './backgroundFolders';
// ===== 背景清单：每层一个默认背景，房间可以单独换（地图里的 Floor.background / WorldModel.roomBackgrounds 写这里的 id）=====
// 背景图放在 src/asset/image/background/，**不在** asset/index.ts 的启动清单里：进到用它的那一层才加载，换层时用不到的放掉。
// 一个背景可以叠好几层（从远到近），每层有视差：人在房间里走动时远的挪得少、近的挪得多。
// 新背景：在 image/background/ 下建文件夹，放 1.far.png、2.middle.png 等，按数字自动排序。

/** 一层图 */
export interface BackgroundLayer {
  /** 已补好天空的透明云层 */
  motion?: 'cloud';
  /** 文件名（src/asset/image/background/ 下） */
  file: string;
  /**
   * 视差（像素）：人从房间一头走到另一头，这一层反方向挪多少（竖直方向挪一半）。0 = 钉在房间上不动；越近的层越大。
   * 图会放大到盖住「房间 + 两边各留这么多」，挪的时候边上不露空
   */
  parallax: number;
  /** 透明度（默认 1） */
  alpha?: number;
}

export interface BackgroundDef {
  /** 轻风、流雾和少量微光；不移动房间边界 */
  ambient?: 'woodland';
  id: string;
  /** 编辑器下拉里显示的名字（开发工具，中文） */
  name: string;
  /** 从远到近；空 = 程序画的星空（不用加载图片） */
  layers: BackgroundLayer[];
  /** 像素风的图写 true（放大不糊）；画的图默认平滑放大 */
  pixelated?: boolean;
}

/** 不写背景的层用它：渐变天空 + 星星，程序画的 */
export const DEFAULT_BACKGROUND = 'sky';

const LEGACY_BACKGROUNDS: readonly BackgroundDef[] = [
  { id: DEFAULT_BACKGROUND, name: '星空（默认）', layers: [] },
  { id: 'cave', name: '洞穴', layers: [{ file: 'cave_far.png', parallax: 10 }, { file: 'cave_near.png', parallax: 34 }] },
  { id: 'dusk', name: '黄昏', layers: [{ file: 'dusk_sky.png', parallax: 4 }, { file: 'dusk_hills.png', parallax: 24 }] },
];

/** 背景图的地址（Vite 打包时带哈希；只是地址，真正下载要等用到的时候） */
const URLS = import.meta.glob<string>('./image/background/**/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' });
const FOLDER_OPTIONS = import.meta.glob<BackgroundFolderOptions>('./image/background/*/background.json', { eager: true, import: 'default' });
const folderBackgrounds = discoverBackgroundFolders(
  Object.keys(URLS).map(path => path.replace('./image/background/', '')),
  Object.fromEntries(Object.entries(FOLDER_OPTIONS).map(([path, value]) => [path.split('/').at(-2)!, value])),
);
/** 文件夹定义优先，旧地图中的背景 id 保持兼容。 */
export const BACKGROUNDS: readonly BackgroundDef[] = [
  ...LEGACY_BACKGROUNDS.filter(background => !folderBackgrounds.some(folder => folder.id === background.id)),
  ...folderBackgrounds,
];
if (new Set(BACKGROUNDS.map(background => background.id)).size !== BACKGROUNDS.length) {
  throw new Error('背景文件夹使用了重复的 id');
}

export function backgroundUrl(file: string): string | undefined { return URLS[`./image/background/${file}`]; }

/** 背景图在 Phaser 贴图管理器里的 key（都带 bg: 前缀，换层时按前缀找出用不到的放掉） */
export const BACKGROUND_KEY_PREFIX = 'bg:';
export const backgroundKey = (file: string): string => BACKGROUND_KEY_PREFIX + file;

export function backgroundDef(id: string | undefined): BackgroundDef {
  return BACKGROUNDS.find(b => b.id === id) ?? BACKGROUNDS[0];
}
