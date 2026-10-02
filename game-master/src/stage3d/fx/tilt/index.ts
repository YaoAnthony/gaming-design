// ===== 整个画面往后倒（绕底边），游戏接着玩；收场时扶起来 =====
import { STAGE_FX } from '@/protocol';
import { defineStageFx } from '../define';

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

defineStageFx({
  id: STAGE_FX.tilt,
  start(ctx) {
    /** 倒下去的进度 0..1，往哪边走 */
    let k = 0, dir = 1;
    return {
      update(dtMs) {
        const { angle, ms } = ctx.config().tilt;
        k = Math.max(0, Math.min(1, k + dir * (ms > 0 ? dtMs / ms : 1)));
        ctx.screen.setTilt(angle * easeInOut(k));
        return dir > 0 || k > 0;
      },
      end() { dir = -1; },
      dispose() { ctx.screen.setTilt(0); },
    };
  },
});
