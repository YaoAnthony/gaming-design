// ===== 跨场景带着走的状态 =====

export interface EntryState { x: number; y: number; vx: number; vy: number }

/** 迷雾的探索记忆：见过的格子 + 已揭开的迷雾区（FogOfWar.toState / 构造参数；将来做「继续游戏」时用） */
export interface FogState {
  /** 每行一串 '0'/'1'，和整张地图同尺寸 */
  explored: string[];
  /** "房间key:区号" */
  revealedZones: string[];
}

/** 换层时各机制交出来、带到下一层的东西（Mechanic.persist 往里写） */
export interface CarryOver {
  /** 手里拿着的道具（Items 注册表的 id） */
  held?: string;
  /** 头上戴着帽子 */
  hat?: boolean;
}
