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
  /** 一行最多几个音符 */
  maxPerRow: number;
  /** 这些字符占满一整行就过不去了（只能换道躲的弹幕不能整排都是） */
  blocking: string;
  /** 音符是从 2D 画面里飞出来的（骷髅王弹出来、沿道冲向画面外） */
  fromScreen: boolean;
}

export const RHYTHM_MODES = {
  /** 喵斯快跑（2D 横版）：上下两排，'x' 从右边过来，到跟前按上 / 下。第一个字符是上排 */
  dash: { realm: 'flat', lanes: 2, chars: 'x', maxPerRow: 1, blocking: '', fromScreen: false },
  /** 太鼓达人（2D）：一条轨道，'r' 红（咚）按左、'b' 蓝（咔）按右 */
  taiko: { realm: 'flat', lanes: 1, chars: 'rb', maxPerRow: 1, blocking: '', fromScreen: false },
  /** 节奏大师（2D）：四条道，'x' 从钢琴往下落，到线上按那条道的键（左、上、下、右 = A、W、S、D） */
  mania: { realm: 'flat', lanes: 4, chars: 'x', maxPerRow: 2, blocking: '', fromScreen: false },
  /** 节奏光剑（3D）：四条道，方块上画着方向 '^' 'v' '<' '>'，到跟前按那个方向 */
  saber: { realm: 'deep', lanes: 4, chars: '^v<>', maxPerRow: 1, blocking: '', fromScreen: true },
  /** 躲（3D）：四条道，'o' 弹幕（只能换道躲）、'_' 横杠（跳得过） */
  dodge: { realm: 'deep', lanes: 4, chars: 'o_', maxPerRow: 4, blocking: 'o', fromScreen: true },
} as const satisfies Record<string, ModeSpec>;

export type ModeId = keyof typeof RHYTHM_MODES;
