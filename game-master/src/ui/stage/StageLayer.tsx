// ===== 把 3D 舞台挂到游戏舞台上：一块盖在游戏画布上面、HUD 下面的画布 =====
// 第一次有特效要放时才建舞台（建 WebGL 上下文）；没有 WebGL 就不放，直接回「放完了」。
// 有节奏关卡在进行（rhythm/session）时主角跳出来，带起来的是 RhythmWorld（那一场由 game/rhythm/RhythmFight 主持）。
// 主角跳出画面（EVT.heroLeft）时在舞台上把 3D 世界带起来，人走回画面再交还（EVT.heroReturn）；人在哪个世界记进存档（试玩不记）
import { useEffect, useRef } from 'react';
import { bridge, EVT, STAGE_FX, type HeroHandoff, type StageFxRef } from '@/protocol';
import { getGame } from '@/game/PhaserGame';
import { screenFeed } from '@/game/core/ScreenFeed';
import { store } from '@/redux/store';
import { Stage3D } from '@/stage3d/Stage3D';
import { World3D } from '@/world3d/World3D';
import { levelById } from '@/world3d/levels';
import { RhythmWorld } from '@/world3d/rhythm/RhythmWorld';
import { rhythmSession } from '@/rhythm';
import { setRealm } from '@/redux/slices/runSlice';
import { IMAGES } from '@/asset';

/** 现在挂着的舞台层：要用舞台时现建 */
let host: (() => Stage3D | null) | null = null;

/** 拿舞台（没建过就现建）。没挂舞台层、游戏没起来、没有 WebGL 时返回 null */
export const acquireStage = (): Stage3D | null => host?.() ?? null;

export function StageLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!, root = canvas.parentElement!;
    let stage: Stage3D | null = null, failed = false;
    const observer = new ResizeObserver(() => stage?.layout());

    const ensure = (): Stage3D | null => {
      const game = getGame();
      if (stage || failed || !game) return stage;
      const source = screenFeed(game);
      try {
        stage = new Stage3D({
          canvas, source,
          config: () => store.getState().config.stage3d,
          measure: () => {
            const s = root.getBoundingClientRect(), r = source.canvas.getBoundingClientRect();
            return { w: s.width, h: s.height, screen: { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height } };
          },
          onFxDone: id => { bridge.emit(EVT.stageFxDone, { id }); },
        });
      } catch { failed = true; return null; }
      observer.observe(root); observer.observe(source.canvas);
      return stage;
    };

    host = ensure;
    const onFx = (ref: StageFxRef) => { if (!ensure()?.start(ref.id) && !stage?.isRunning(ref.id)) bridge.emit(EVT.stageFxDone, ref); };
    const onEnd = (ref: StageFxRef) => { stage?.end(ref.id); };
    const onHeroLeft = (handoff: HeroHandoff) => {
      const heroImage = (IMAGES.find(i => i.key === handoff.texture) ?? IMAGES[0]).url, session = rhythmSession();
      // 节奏关卡轮到 3D 的段落：带起来的是 RhythmWorld，人回到画面后那一场接着由 2D 一侧主持
      if (session) {
        const cfg = () => store.getState().config;
        const world = ensure()?.add(STAGE_FX.world, ctx => new RhythmWorld(ctx, handoff, {
          config: () => cfg().world3d.rhythm, session, heroUrl: heroImage, returnMs: cfg().world3d.returnMs,
          onExit: () => { bridge.emit(EVT.heroReturn, null); },
        }));
        if (!world) bridge.emit(EVT.heroReturn, null);
        return;
      }
      const { run, hud } = store.getState(), saves = !hud.playtest;
      const level = levelById(run.deep?.levelId);
      const heroUrl = heroImage;
      const world = ensure()?.add(STAGE_FX.world, ctx => new World3D(ctx, handoff, {
        config: () => store.getState().config.world3d, level, heroUrl,
        onExit: at => { if (saves) store.dispatch(setRealm({ realm: 'flat' })); bridge.emit(EVT.heroReturn, at); },
      }));
      if (!world) { bridge.emit(EVT.heroReturn, null); return; }   // 舞台起不来：人原地放回去
      if (saves) store.dispatch(setRealm({ realm: 'deep', levelId: level.id }));
    };
    bridge.on(EVT.stageFx, onFx); bridge.on(EVT.stageFxEnd, onEnd); bridge.on(EVT.heroLeft, onHeroLeft);
    return () => {
      bridge.off(EVT.stageFx, onFx); bridge.off(EVT.stageFxEnd, onEnd); bridge.off(EVT.heroLeft, onHeroLeft);
      if (host === ensure) host = null;
      observer.disconnect();
      stage?.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="stage3d" />;
}
