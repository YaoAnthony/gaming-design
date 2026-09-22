// ===== 世界模型（地图）=====
/** 房间字符画 + 布局。map/world.json 就是这个结构 */
export interface WorldModel {
  roomW: number;
  roomH: number;
  /** layout[ry][rx] = 房间 key，第一行是最上面一排 */
  layout: string[][];
  /** 每个房间 roomH 行、每行 roomW 个字符 */
  rooms: Record<string, string[]>;
  /** 房间名 / 谜题提示 */
  names: Record<string, string>;
}
