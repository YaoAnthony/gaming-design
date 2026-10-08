// ===== 背景清单：每层一个默认背景，房间可以单独换（地图里的 Floor.background / WorldModel.roomBackgrounds 写这里的 id）=====
// 背景图放在 src/asset/image/background/，**不在** asset/index.ts 的启动清单里：进到用它的那一层才加载，换层时用不到的放掉。
// 一个背景可以叠好几层（从远到近），每层有视差：人在房间里走动时远的挪得少、近的挪得多。
// 加一个背景：图放进 image/background/，这里加一项。占位图用 `npm run gen-art -- background` 重新生成。

/** 一层图 */
export interface BackgroundLayer {
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

export const BACKGROUNDS: readonly BackgroundDef[] = [
  { id: DEFAULT_BACKGROUND, name: '星空（默认）', layers: [] },
  { id: 'cave', name: '洞穴', layers: [{ file: 'cave_far.png', parallax: 10 }, { file: 'cave_near.png', parallax: 34 }] },
  { id: 'dusk', name: '黄昏', layers: [{ file: 'dusk_sky.png', parallax: 4 }, { file: 'dusk_hills.png', parallax: 24 }] },
  // 保留已存地图的背景 id；文件切换到通过接缝校验的版本。
  { id: 'woodland-a-v1', name: '木作森林 · A 月下林心', pixelated: true, layers: [{ file: 'woodland-a-v1.png', parallax: 0 }] },
  { id: 'woodland-b-v1', name: '木作森林 · B 东侧林缘', pixelated: true, layers: [{ file: 'woodland-b-v2.png', parallax: 0 }] },
  { id: 'woodland-c-v1', name: '木作森林 · C 废弃伐木营地', pixelated: true, layers: [{ file: 'woodland-c-v2.png', parallax: 0 }] },
  { id: 'woodland-d-v1', name: '木作森林 · D 西侧林缘', pixelated: true, layers: [{ file: 'woodland-d-v2.png', parallax: 0 }] },
  { id: 'woodland-e-v1', name: '木作森林 · E 蕨叶洼地', pixelated: true, layers: [{ file: 'woodland-e-v2.png', parallax: 0 }] },
  { id: 'woodland-f-v1', name: '木作森林 · F 松林风谷', pixelated: true, layers: [{ file: 'woodland-f-v2.png', parallax: 0 }] },
  { id: 'woodland-g-v1', name: '木作森林 · G 旧采石场', pixelated: true, layers: [{ file: 'woodland-g-v2.png', parallax: 0 }] },
  { id: 'woodland-h-v1', name: '木作森林 · H 风车高林', pixelated: true, layers: [{ file: 'woodland-h-v2.png', parallax: 0 }] },
  { id: 'woodland-i-v1', name: '木作森林 · I 盘根林地', pixelated: true, layers: [{ file: 'woodland-i-v2.png', parallax: 0 }] },
  { id: 'woodland-j-v1', name: '木作森林 · J 风口树冠', pixelated: true, layers: [{ file: 'woodland-j-v2.png', parallax: 0 }] },
  { id: 'woodland-k-v1', name: '木作森林 · K 林心树冠', pixelated: true, layers: [{ file: 'woodland-k-v2.png', parallax: 0 }] },
  { id: 'woodland-m-v1', name: '木作森林 · M 高枝林隙', pixelated: true, layers: [{ file: 'woodland-m-v2.png', parallax: 0 }] },
  { id: 'woodland-n-v1', name: '木作森林 · N 废弃观星台', pixelated: true, layers: [{ file: 'woodland-n-v2.png', parallax: 0 }] },
  { id: 'woodland-o-v1', name: '木作森林 · O 积水根谷', pixelated: true, layers: [{ file: 'woodland-o-v2.png', parallax: 0 }] },
];

/** 背景图的地址（Vite 打包时带哈希；只是地址，真正下载要等用到的时候） */
const URLS = import.meta.glob<string>('./image/background/*.png', { eager: true, query: '?url', import: 'default' });

export function backgroundUrl(file: string): string | undefined { return URLS[`./image/background/${file}`]; }

/** 背景图在 Phaser 贴图管理器里的 key（都带 bg: 前缀，换层时按前缀找出用不到的放掉） */
export const BACKGROUND_KEY_PREFIX = 'bg:';
export const backgroundKey = (file: string): string => BACKGROUND_KEY_PREFIX + file;

export function backgroundDef(id: string | undefined): BackgroundDef {
  return BACKGROUNDS.find(b => b.id === id) ?? BACKGROUNDS[0];
}
