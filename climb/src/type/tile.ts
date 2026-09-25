// ===== 砖块 / 物件的类型 =====

/** 砖块能力：地形、爆炸、掉落、危险判定只看这些字段 */
export interface TileCaps {
  /** 实心：挡住玩家、怪物、碎块 */
  solid: boolean;
  /** 锚点：自身永不掉落，相连的实心格子都被它撑住 */
  anchor: boolean;
  /** 可被爆炸摧毁 */
  destructible: boolean;
  /** 额外感应半径（格）：0 = 只在爆炸范围内才碎；1 = 范围外一圈也会碎 */
  blastSensitivity: number;
  /** 被波及后沿同类格子连锁崩塌 */
  chainCollapse: boolean;
  /** 周围有爆炸就整块松脱、随重力掉下来（不会被炸没）；感应距离用 blastSensitivity */
  looseOnBlast: boolean;
  /** 松脱后不是砸下来而是匀速飘下来的速度（像素/秒）；0 = 正常重力。飘落的东西落到怪物头上会被驮着走 */
  floatSpeed: number;
  /** 下落 / 被驮着的时候也是一块能从上面站的平台 */
  rideable: boolean;
  /** 连锁传导时，每多一跳（格）延迟多少毫秒摧毁；0 = 瞬间摧毁（默认）。用来做"导火索"式的可见传导。 */
  chainDelayMs: number;
  /** 只有链条的两端（同类相邻格子 ≤ 1 个）能被爆炸点燃，中间段对爆炸免疫；点燃后仍会从一头烧到另一头 */
  igniteAtEndsOnly: boolean;
  /** 非空 = 碰到即死，值是死亡提示 */
  hazard: string | null;
  /** 危险格真正致命的区域（格内像素坐标）；不设 = 整格 */
  hazardBox: { x: number; y: number; w: number; h: number } | null;
  /** 挂在下面那一格上（比如尖刺）：下面那格被炸掉 / 掉下去、不再是实心，它就跟着碎掉 */
  mounted: boolean;
  /** 单向平台：玩家和怪物只能从上面落到它上面站着，从下面、侧面都能穿过去（薄木板） */
  oneWay: boolean;
  /** 箱子不和它碰撞：箱子会从它上面漏下去、也能被推着穿过它 */
  boxPassThrough: boolean;
  /** 被引线烧到时不消失，变成这种砖（岩石 → 碎岩）；null = 照常烧掉 */
  crackTo: string | null;
}

/** 一条能力特征（Trait），可组合 */
export type TileTrait = Partial<TileCaps> & { editorVisible?: boolean };

/** 注册砖块时写的内容 */
export interface TileSpec {
  id: string;
  name: string;
  desc?: string;
  /** 编辑器 / 预览用的代表色 */
  color: number;
  /** 图集帧序号，-1 或省略 = 不画（空气）。autotile 时是 16 帧的起始帧 */
  frame?: number;
  /** 自动拼贴：按四周同类格子（上=1 右=2 下=4 左=8）选 frame + 掩码 那一帧 */
  autotile?: boolean;
  /** 编辑器物品栏用的帧；省略用 frame */
  iconFrame?: number;
  /** 游戏里用的帧（autotile 时是起始帧）；省略用 frame。用来让某些砖块在游戏里不那么显眼 */
  gameFrame?: number;
  editorVisible?: boolean;
}

/** 注册完成后的砖块定义 */
export interface TileDef extends TileCaps {
  id: string;
  name: string;
  desc: string;
  color: number;
  frame: number;
  autotile: boolean;
  iconFrame: number;
  gameFrame: number;
  editorVisible: boolean;
  /** 派生：实心且不是锚点的格子才可能掉落 */
  canFall: boolean;
  /** 注册顺序 */
  index: number;
}

export interface CellRef { x: number; y: number }
export interface RoomCoord { rx: number; ry: number }
export interface Point { x: number; y: number }

/** 核心物件（出生点、巡逻怪）进场时拿到的东西；机制的物件拿到的是机制实例 */
export interface CoreHost {
  addSpawnPoint(p: Point): void;
  addEnemy(spawn: EnemySpawn): void;
}
export interface EnemySpawn extends Point, RoomCoord {}

/** 会说话的小角色：挡在路上，走近强制对话，每跳一次（炸一次）下一句，说完就消失 */
export interface DialogueLine {
  text: string;
  /** 这一句用哪个头像（AVATARS 的 key）；不写就用角色默认头像 */
  avatar?: string;
  /** 自动翻页：显示这么多毫秒后自己到下一句（剧情对话用，不用按键） */
  autoMs?: number;
  /** 对话框放上面还是下面；不写就自动躲开玩家（人在下半屏就放上面） */
  pos?: 'top' | 'bottom';
}

export interface NpcSpawn extends Point {
  name: string;
  texture: string;
  /** 默认头像 key */
  avatar?: string;
  lines: DialogueLine[];
  /** 消失时播放的音效 key */
  sound?: string;
}

/** 可捡起的道具：捡到后一直带着（换层、死亡都不掉） */
export interface ItemDef {
  id: string;
  name: string;
  texture: string;
  /** 拿在手上时的照明半径（格）；0 = 不发光 */
  light: number;
  index: number;
}
export type ItemSpec = Omit<ItemDef, 'index' | 'light'> & { light?: number };

export interface ItemSpawn extends Point { item: ItemDef }

/** 游戏里的滑块：一条轨道 + 一个能推着走的滑钮，位置映射到某个数值设置（比如音量） */
export interface SliderSpawn extends Point {
  /** 轨道长度（格），从图标右边开始 */
  length: number;
  /** 绑定到 GameConfig 里哪个数字字段 */
  config: 'musicVolume';
  min: number;
  max: number;
}

/** 物件在地图上的位置：wx/wy 是格子中心的像素坐标 */
export interface SpawnAt {
  x: number;
  y: number;
  cell: CellRef & RoomCoord;
}

export interface EntitySpec {
  id: string;
  name: string;
  desc?: string;
  /** 贴图 key（对应 asset 清单） */
  texture: string;
  /** 全地图只能有一个（出生点） */
  unique?: boolean;
  /** 编辑器缩略图里的代表色 */
  color?: number;
  /** 贴图相对格子的锚点（0~1）：默认居中；[0.5, 1] = 底边贴着格子底、水平居中（站在地上的东西） */
  origin?: [number, number];
  /** 物品栏里归到哪个分区（默认「物件」） */
  group?: string;
  /** 属于哪个机制（机制 id）；不写 = 核心物件，spawn 拿到 CoreHost */
  mechanic?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 机制物件的实例类型由 defineMechanic 那边保证
  spawn(target: any, at: SpawnAt): void;
}

export interface EntityDef extends Required<Omit<EntitySpec, 'spawn'>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawn(target: any, at: SpawnAt): void;
  index: number;
}

export type Classified =
  | { kind: 'tile'; def: TileDef }
  | { kind: 'entity'; def: EntityDef };
