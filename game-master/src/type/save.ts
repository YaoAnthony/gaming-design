// ===== 跨场景带着走的状态 =====

export interface EntryState { x: number; y: number; vx: number; vy: number }

/** 迷雾的探索记忆：见过的格子 + 已揭开的迷雾区（FogOfWar.toState / 构造参数；将来做「继续游戏」时用） */
export interface FogState {
  /** 每行一串 '0'/'1'，和整张地图同尺寸 */
  explored: string[];
  /** "房间key:区号" */
  revealedZones: string[];
}

/**
 * 换层、存档时各机制交出来、带到下一层的东西：机制 id → 那个机制自己的数据（Mechanic.persist 返回的，要能存成 JSON）。
 * 进层时机制用 ctx.carried(自己的 id) 拿回来，自己检查对不对——存档可能是旧版本的、被改过的。
 * 例：{ carry: 'candle'（手上的道具）, hat: true（戴着帽子） }。新机制要带东西：实现 persist / 读 carried，这里和存档格式都不用改
 */
export type CarryOver = Record<string, unknown>;
