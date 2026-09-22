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
  /** 引线层（可选）：每个房间 roomH 行，'.' = 无，'W' = 有引线。叠在地形之上，不占格子、不挡人 */
  fuse?: Record<string, string[]>;
  /** 房间级开关（可选） */
  roomFlags?: Record<string, RoomFlags>;
}

export interface RoomFlags {
  /** 这个房间不要迷雾（比如出生房间、剧情房间） */
  noFog?: boolean;
}
