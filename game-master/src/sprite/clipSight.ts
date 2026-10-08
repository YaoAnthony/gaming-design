// ===== 夹子桑看不看得见主角（不碰 Phaser，单测在 tests/sprite/clipSight.test.ts） =====

export interface SightBox { left: number; right: number; top: number; bottom: number }

/**
 * 看得见 = 同一层（两边脚底上下差不过 rows 格）、横向隔着不到 range 格、两人中间它站的那一行没有实心格挡着。
 * 前后都看，不管朝哪边。隔着坑也看得见（追到坑边停下来干瞪着）
 */
export function clipSees(
  clip: SightBox, player: SightBox, T: number, isSolid: (cx: number, cy: number) => boolean, range: number, rows: number,
): boolean {
  const gap = Math.max(player.left - clip.right, clip.left - player.right);
  if (gap > range * T || Math.abs(player.bottom - clip.bottom) > rows * T) return false;
  const row = Math.floor((clip.bottom - 1) / T);
  const a = Math.floor((clip.left + clip.right) / 2 / T), b = Math.floor((player.left + player.right) / 2 / T);
  for (let cx = Math.min(a, b) + 1; cx < Math.max(a, b); cx++) if (isSolid(cx, row)) return false;
  return true;
}
