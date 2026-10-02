// ===== 节奏关卡里的玩法：一张谱分成几段，每段换一种玩法 =====
// 这里只有各玩法的「谱面怎么写、在哪个世界玩」（引擎无关，2D、3D 两边都要看）。怎么玩、怎么画：
// 2D 的（realm = flat，画在游戏画面里）在 game/rhythm/modes/，3D 的（realm = deep，主角跳出画面）在 world3d/rhythm/modes/。
// 加一种玩法：这里加一条，对应那一边的 modes/ 里加一个文件并注册。

export interface ModeSpec {
  /** 在哪玩：flat = 2D 游戏画面里，deep = 画面外的 3D 大道上 */
  realm: 'flat' | 'deep';
  /** 一行几个字符（几条道 / 几排） */
  lanes: number;
  /** 能用哪些字符（'.' 是空，都能用） */
  chars: string;
  /** 这些字符是长按的头：下面紧跟着的几行在同一条道上写 '|'，写到哪按到哪。空 = 这种玩法没有长按 */
  holds: string;
  /** 一行最多几个音符 */
  maxPerRow: number;
  /** 这些字符占满一整行就过不去了（只能换道躲的弹幕不能整排都是） */
  blocking: string;
  /** 音符是从 2D 画面里飞出来的（骷髅王弹出来、沿道冲向画面外） */
  fromScreen: boolean;
  /** 音符飞得多快（倍数）：2 = 路上只花一半的时间，出来得晚、冲得快 */
  speed: number;
  /** 要人自己换道走过去才打得到的玩法：一拍来得及换几条道（谱面里相邻两个音符不能隔得比这远）；0 = 不用走 */
  reach: number;
  /** 按键出的是平时起跳爆炸的那一声（按一下响一下），不出判定音 */
  boom?: boolean;
}

export const RHYTHM_MODES = {
  /**
   * Give It Up（2D）：小人跟着拍子在一排柱子上一格一格地跳，自己会跳，不用管；只有两种时候要在起跳的那一拍按空格：
   * 'u' 下一根柱子高一截（按了才跳得上去），'x' 下一根是尖刺（按了一下跨过去，落在再下一根上）。只能写在整拍上
   */
  giveup: { realm: 'flat', lanes: 1, chars: 'ux', holds: '', maxPerRow: 1, blocking: '', fromScreen: false, speed: 1, reach: 0, boom: true },
  /** 喵斯快跑（2D 横版）：上下两排，'x' 从右边过来，到跟前按上 / 下。第一个字符是上排 */
  dash: { realm: 'flat', lanes: 2, chars: 'x', holds: '', maxPerRow: 1, blocking: '', fromScreen: false, speed: 1.4, reach: 0 },
  /** 太鼓达人（2D）：一条轨道，'r' 红（咚）按左、'b' 蓝（咔）按右 */
  taiko: { realm: 'flat', lanes: 1, chars: 'rb', holds: '', maxPerRow: 1, blocking: '', fromScreen: false, speed: 1.4, reach: 0 },
  /** 节奏大师（2D）：三条道，'x' 从上面落下来，到线上按那条道的键（从左到右 A S D）；'H' 是长按的头，按住到尾巴过线 */
  mania: { realm: 'flat', lanes: 3, chars: 'xH', holds: 'H', maxPerRow: 2, blocking: '', fromScreen: false, speed: 2.5, reach: 0 },
  /**
   * osu!（3D，像 QTE）：圈悬在半空，外面一圈大环往里缩，缩到和圈重合时按圈上写的键（Q W E R = 从左到右四列）。
   * 字符是圈悬多高：'1' 低、'2' 中、'3' 高；'a' 'b' 'c' 是长按的圈（也是低、中、高）：点中之后按住，里面那一圈缩完才松手；
   * 滑条（也是按住不放）：'A' 'B' 'C' 往右滑到隔壁那一列，'x' 'y' 'z' 往左滑，圈带着人沿着轨道滑过去
   */
  osu: { realm: 'deep', lanes: 4, chars: '123abcABCxyz', holds: 'abcABCxyz', maxPerRow: 1, blocking: '', fromScreen: false, speed: 2, reach: 0 },
  /** 节奏光剑（3D）：四条道，方块 'x' 迎面冲过来；A D 换到它那条道上，到跟前按空格砍掉，砍中的方块弹回去砸骷髅王 */
  saber: { realm: 'deep', lanes: 4, chars: 'x', holds: '', maxPerRow: 1, blocking: '', fromScreen: true, speed: 2, reach: 2, boom: true },
  /** 躲（3D）：四条道，'o' 红墙（只能换道躲）、'_' 黄杠（跳得过） */
  dodge: { realm: 'deep', lanes: 4, chars: 'o_', holds: '', maxPerRow: 4, blocking: 'o', fromScreen: true, speed: 1.5, reach: 0 },
} as const satisfies Record<string, ModeSpec>;

export type ModeId = keyof typeof RHYTHM_MODES;

/** 长按接着上一行：写在长按的头下面 */
export const HOLD_BODY = '|';

/** 四条道的玩法从左到右每条道的键（键盘的 KeyboardEvent.code 和写在画面上的字）；方向键 ← ↑ ↓ → 也是这个顺序 */
export const LANE_KEYS = [{ code: 'KeyQ', label: 'Q' }, { code: 'KeyW', label: 'W' }, { code: 'KeyE', label: 'E' }, { code: 'KeyR', label: 'R' }] as const;
export const LANE_ARROWS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'] as const;
/** 节奏大师三条道从左到右的键：就是「左、下、右」这三个方向（A S D / ← ↓ →） */
export const MANIA_KEYS = [{ dir: 'left', label: 'A' }, { dir: 'down', label: 'S' }, { dir: 'right', label: 'D' }] as const;
