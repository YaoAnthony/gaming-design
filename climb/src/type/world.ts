// ===== 世界模型（地图）=====
/** 房间字符画 + 布局。map/world.json 就是这个结构 */
export interface WorldModel {
  roomW: number;
  roomH: number;
  /** layout[ry][rx] = 房间 key，null = 空位（游戏里是实心岩石，进不去）。第一行是最上面一排 */
  layout: (string | null)[][];
  /** 每个房间 roomH 行、每行 roomW 个字符 */
  rooms: Record<string, string[]>;
  /** 迷雾区（可选）：每个房间 roomH 行，'.' = 无区，'1'-'4' = 区号；玩家进入区内任一格，整个区永久揭开 */
  fog?: Record<string, string[]>;
  /** 物件层（可选）：出生点 / 怪物 / 终点，和砖块分开，所以怪物可以放在尖刺上。'.' = 无 */
  entities?: Record<string, string[]>;
  /** 引线层（可选）：每个房间 roomH 行，'.' = 无，'W' = 有引线。叠在地形之上，不占格子、不挡人 */
  fuse?: Record<string, string[]>;
  /** 房间级开关（可选） */
  roomFlags?: Record<string, RoomFlags>;
  /** 文字方块（可选）：用 3x5 像素字体拼成可炸砖块的一串字，全炸掉就跳到目标层 */
  texts?: Record<string, TextBlock[]>;
}

export interface TextBlock {
  id: string;
  /** 锚点：房间内格坐标（左上角） */
  x: number;
  y: number;
  /** 大写字母 / 数字 / 空格，'\n' 换行 */
  text: string;
  /** 用哪种砖块拼（必须可炸） */
  tile: string;
  /** 全炸掉后跳到哪一层（层 id） */
  target: string;
}

/** 塔的一层：独立的世界 */
export interface Floor {
  id: string;
  name: string;
  model: WorldModel;
}

/** 整个项目 = 若干层，第一层是塔外 */
export interface Project {
  floors: Floor[];
}

export interface RoomFlags {
  /** 这个房间不要迷雾（比如出生房间、剧情房间） */
  noFog?: boolean;
  /** Boss 房间：玩家一进来就封门、出 Boss */
  boss?: boolean;
}
