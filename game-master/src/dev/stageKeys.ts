// ===== 开发期按键：试 3D 舞台的特效 =====
// T：画面往后倒 / 扶起来
// P：主角跳出画面进 3D 世界 / 回到画面
// B：开一场节奏关卡（骷髅王弹琴）/ 中途退出
import { bridge, EVT, STAGE_FX, type StageFxId } from '@/protocol';
import { rhythmSession } from '@/rhythm';

const KEYS: Record<string, StageFxId> = { t: STAGE_FX.tilt };
const POP_OUT_KEY = 'p', RHYTHM_KEY = 'b', RHYTHM_CHART = 'megalovania';
const on = new Set<StageFxId>();

export function watchStageKeys(): void {
  bridge.on(EVT.stageFxDone, ref => { on.delete(ref.id); });
  bridge.on(EVT.heroLeft, () => { on.add(STAGE_FX.world); });
  window.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === POP_OUT_KEY) {
      if (on.has(STAGE_FX.world)) bridge.emit(EVT.stageFxEnd, { id: STAGE_FX.world }); else bridge.emit(EVT.heroPopOut);
      return;
    }
    if (key === RHYTHM_KEY) {
      if (rhythmSession()) bridge.emit(EVT.rhythmStop); else bridge.emit(EVT.rhythmStart, { chartId: RHYTHM_CHART });
      return;
    }
    const id = KEYS[key];
    if (!id) return;
    if (on.has(id)) { bridge.emit(EVT.stageFxEnd, { id }); return; }
    on.add(id);
    bridge.emit(EVT.stageFx, { id });
  });
}
