// ===== Arcade 物理的共用小工具 =====
import type Phaser from 'phaser';

/**
 * 碰撞器的 process 回调：分离前按"现在的位置 - 这一步开始的位置"重算两具身体的位移。
 * Arcade 用两者位移的大小关系判断谁撞了谁、要不要分离，位移相等就当没碰上。有重力的箱子每一步都先陷进砖 0.33px
 * 再被砖顶回来，可位移记录里还留着那 0.33 —— 和站在它上面的人 / 箱子 / 钥匙（同样的重力、同样的 0.33）正好相等，
 * 于是隔一帧才分离一次，上面的东西就 1px 上下抖。重算之后箱子的位移是 0，上面的东西每帧都能稳稳被顶住。
 */
export const syncDeltas: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
  for (const o of [a, b]) {
    const body = ((o as { body?: unknown }).body ?? o) as Phaser.Physics.Arcade.Body & { _dx: number; _dy: number };
    if (!body.prev || !body.moves) continue;
    body._dx = body.x - body.prev.x;
    body._dy = body.y - body.prev.y;
  }
  return true;
};
