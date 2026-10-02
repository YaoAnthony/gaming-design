// ===== 主角的交接：人从 2D 游戏的画面里跳出来、到 3D 世界去，再走回画面 =====
// 2D 一侧把人藏起来、交出这份数据；3D 一侧照着它在画面的同一个位置造出人来，看不出换了人

export interface HeroHandoff {
  /** 人的中心在画面上的位置（比例坐标 0..1，左上角是原点） */
  x: number;
  y: number;
  /** 人的宽高（占画面宽 / 高的比例） */
  w: number;
  h: number;
  /** 朝向：1 朝右，-1 朝左 */
  facing: 1 | -1;
  /** 人现在用的贴图（资源清单 IMAGES 的 key） */
  texture: string;
  /** 一格砖占画面宽的比例：3D 世界拿一格当长度单位，尺寸就接得上 */
  tile: number;
}

/** 画面上的一个位置（比例坐标 0..1，左上角是原点）：人的中心 */
export interface ScreenSpot { x: number; y: number }

/**
 * 人要从这里走回画面：3D 一侧填 want（碰到屏幕的地方），发出去；
 * 2D 一侧当场把 answer 填成离它最近、人站得下的位置（那里是墙就挪到旁边的空地）。总线是同步的，发完就能读 answer
 */
export interface HeroEntryQuery { want: ScreenSpot; answer?: ScreenSpot }
