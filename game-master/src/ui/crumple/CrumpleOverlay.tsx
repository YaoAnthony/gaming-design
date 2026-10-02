// ===== 第四面墙：骷髅手从屏幕左边伸进来，一把攥住整个游戏画面，揉成纸团，扔掉 =====
// 要无缝：GameScene 发 EVT.crumple 时游戏照常跑，手先伸到正在进行的画面上；手碰到画面时发 EVT.crumpleFreeze，
// 游戏冻住（EVT.crumpleFrozen），3D 舞台上的屏幕同一帧换成摆在原位的「纸」（和冻住的画面一模一样），然后才开始攥。
// 纸团扔出画面后发 EVT.crumpleDone（带上淡入时长）：游戏做攥之前说好的事（重置房间），新画面在舞台上淡入，淡入完骷髅手再把人放下来。
// 这里管时间线、手、声音；纸本身在 3D 舞台上（stage3d/fx/crumple 的 CrumplePaper），每帧把纸的状态交给它画。
// 人在 3D 世界里时不画这只伸进画面的手：手的主人（披风骷髅）就站在屏幕旁边，同一套动作交给舞台上的骷髅去做。
import { useEffect, useRef, useState } from 'react';
import { bridge, EVT, STAGE_FX, type CrumpleDone, type CrumpleStart } from '@/protocol';
import { getGame } from '@/game/PhaserGame';
import { GRAB_HAND } from '@/asset';
import type { CrumpleState, Vec2 } from '@/stage3d/fx/crumple/crumpleMesh';
import { CrumplePaper } from '@/stage3d/fx/crumple/CrumplePaper';
import { acquireStage } from '@/ui/stage/StageLayer';
import { createCrumpleSound } from './crumpleSound';

/** 各段时长（毫秒）：手伸进来 / 攥拳 / 接着揉 / 捏紧 / 停一下 / 往回收（蓄力） / 甩出去 / 纸团飞走 / 空着 / 新画面淡入 */
const DUR = { approach: 800, grab: 350, crumple: 1100, squeeze: 380, hold: 150, windup: 220, throw: 170, fly: 700, empty: 250, fade: 500 };
type Phase = keyof typeof DUR;
/** 每段开始的时刻 */
const AT = (() => {
  let t = 0;
  const at = {} as Record<Phase, number>;
  for (const k of Object.keys(DUR) as Phase[]) { at[k] = t; t += DUR[k]; }
  return at;
})();
/** 手碰到画面之前多少毫秒请游戏冻住（复制那一帧要等游戏再画一帧） */
const FREEZE_LEAD = 80;
/** 甩到这个比例时松手；松手后手指多少毫秒张开 */
const RELEASE = 0.55, OPEN_MS = 120;
const T_RELEASE = AT.throw + DUR.throw * RELEASE;
/**
 * 手：拳头是纸团直径的多少倍（小于 1：纸团比拳头大一圈，从指缝和拳头四周鼓出来）；刚伸进来时离纸多高（放大倍数）；
 * 蓄力往回收到哪、甩到哪（舞台宽高的比例，相对拳心）和转的角度（度）；紫光颜色
 */
const HAND = {
  fistToBall: 0.7, hover: 0.12,
  windup: { x: -0.07, y: 0.05, angle: -12 }, swing: { x: 0.08, y: -0.1, angle: 20 },
  glow: 'rgba(155, 93, 229, 0.45)',
};
/** 纸团飞走：往右上抛起再落出画面右边（控制点 / 终点，舞台宽高的比例）；转几圈、翻几圈、最后缩到多大 */
const FLY = { lift: { x: 0.25, y: -0.4 }, end: { y: 0.3 }, spins: 2.2, tumbles: 1.3, shrink: 0.45 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpV = (a: Vec2, b: Vec2, k: number): Vec2 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const bezier = (a: Vec2, b: Vec2, c: Vec2, k: number): Vec2 => lerpV(lerpV(a, b, k), lerpV(b, c, k), k);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeOutQuad = (k: number) => 1 - (1 - k) ** 2;
const easeIn = (k: number) => k ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const progress = (t: number, p: Phase) => clamp01((t - AT[p]) / DUR[p]);

interface HandPlan {
  /** 拳心：对准攥住纸的地方、从哪里伸进来（整只手都在画面左边外面）；蓄力、甩出去时拳心到哪 */
  at: Vec2; from: Vec2; wind: Vec2; swing: Vec2;
  /** 放大倍数，放大后一帧的宽高（像素） */
  scale: number; w: number; h: number;
  /** 纸团飞走的控制点和终点（画面右边外面） */
  lift: Vec2; out: Vec2;
}

/** 手从左边水平伸进来，拳心对准攥住的点；放大到手臂末端出了画面左边，拳头又比纸团小一圈 */
function planHand(stageW: number, stageH: number, grab: Vec2, ballRadius: number): HandPlan {
  const [gx] = GRAB_HAND.grip;
  const scale = Math.max(grab.x / (gx * GRAB_HAND.frameW) * 1.08, HAND.fistToBall * 2 * ballRadius / GRAB_HAND.fistHeight);
  const w = GRAB_HAND.frameW * scale, h = GRAB_HAND.frameH * scale;
  const off = (o: { x: number; y: number }): Vec2 => ({ x: grab.x + o.x * stageW, y: grab.y + o.y * stageH });
  return {
    at: grab, scale, w, h,
    // 起点：往左退到整只手（放大到 1 + hover 倍时）都出了画面，稍微低一点，伸进来带点弧度
    from: { x: -(1 - gx) * w * (1 + HAND.hover) - 40, y: grab.y + 0.08 * h },
    wind: off(HAND.windup), swing: off(HAND.swing),
    lift: off(FLY.lift), out: { x: stageW + ballRadius * 2, y: FLY.end.y * stageH },
  };
}

/** hand（CrumpleState 里的）是纸 / 纸团的位置；handAt 是手画在哪 */
interface Pose extends CrumpleState {
  handAt: Vec2;
  handVisible: boolean;
  /** 握拳程度 0..1，和它对应的是手的第几帧：0 张开 … frames-1 握拳 */
  curl: number;
  frame: number;
  /** 手的缩放、角度（度）、离纸的高度 0..1（影子的远近） */
  scale: number; angle: number; height: number;
  /** 画面震动的幅度（像素） */
  shake: number;
  /** 纸团已经飞出画面 */
  paperGone: boolean;
}

/** 甩出去之前（t 在 [0, T_RELEASE]）手的位置和角度 */
function handBeforeRelease(t: number, p: HandPlan, wobble: number): { at: Vec2; angle: number } {
  if (t < AT.grab) { const k = easeOut(progress(t, 'approach')); return { at: lerpV(p.from, p.at, k), angle: 6 * (1 - k) }; }
  if (t < AT.windup) return { at: p.at, angle: 1.5 * wobble };
  if (t < AT.throw) { const k = easeInOut(progress(t, 'windup')); return { at: lerpV(p.at, p.wind, k), angle: HAND.windup.angle * k }; }
  const k = easeInOut(progress(t, 'throw'));
  return { at: lerpV(p.wind, p.swing, k), angle: lerp(HAND.windup.angle, HAND.swing.angle, k) };
}

/** 第 t 毫秒的样子 */
function pose(t: number, p: HandPlan): Pose {
  const curl = easeOut(progress(t, 'grab'));
  // 攥拳那一刻纸就开始往拳头里收：攥拳 + 接着揉两段连起来，先快后慢
  const cr = easeOutQuad(clamp01((t - AT.grab) / (DUR.grab + DUR.crumple)));
  const sq = easeOut(progress(t, 'squeeze'));
  // 使劲攥：拳头抖（捏紧时停下）
  const wobble = t >= AT.crumple && t < AT.hold ? Math.sin((t - AT.crumple) / 1000 * Math.PI * 2 * 6) * (1 - sq) : 0;
  const released = t >= T_RELEASE;
  // 手：松手前按上面的路线走；松手后张开，顺着甩出去的方向往回缩出画面左边
  const before = handBeforeRelease(Math.min(t, T_RELEASE), p, wobble);
  const back = easeIn(clamp01((t - T_RELEASE) / (AT.empty - T_RELEASE)));
  const handAt = released ? lerpV(before.at, p.from, back) : before.at;
  const angle = released ? before.angle * (1 - back) : before.angle;
  const opened = released ? easeOut(clamp01((t - T_RELEASE) / OPEN_MS)) : 0;
  // 纸 / 纸团：蓄力之前待在原位；攥在拳头里跟着拳头走；松手后沿弧线飞出画面右边，边飞边转、越飞越远（缩小）
  const fl = clamp01((t - T_RELEASE) / (AT.empty - T_RELEASE));
  const paperAt = !released ? (t < AT.windup ? p.at : handAt) : bezier(before.at, p.lift, p.out, fl);
  const closed = AT.grab + DUR.grab * 0.6;   // 手指合上的那一下
  const since = t - closed;
  const shake = (since >= 0 && since < 260 ? 6 * (1 - since / 260) : 0) + (t >= AT.squeeze && t < AT.hold ? 3 * (1 - sq) : 0);
  return {
    crumple: cr, pinch: curl, squeeze: sq, hand: paperAt,
    spin: fl * FLY.spins * Math.PI * 2, tumble: fl * FLY.tumbles * Math.PI * 2, ballScale: 1 - FLY.shrink * fl,
    handAt,
    handVisible: t < AT.empty,
    curl: curl * (1 - opened),
    frame: Math.round(curl * (1 - opened) * (GRAB_HAND.frames - 1)),
    scale: 1 + HAND.hover * (1 - easeOut(progress(t, 'approach'))) - 0.05 * sq * (1 - opened),
    angle,
    height: t < AT.grab ? 1 - easeOut(progress(t, 'approach')) : back,
    shake,
    paperGone: t >= AT.empty,
  };
}

/** 人在 3D 世界里时披风骷髅出场 / 退场各用多久（毫秒）：手伸出去之前从地里升起来，纸团扔掉后淡出 */
const REAPER_MS = { rise: 350, fade: 300 };

/** 开发期调试：window.__crumpleDebug = { speed: 0.2 } 慢放，{ at: 2000 } 停在第 2000 毫秒 */
function debugClock(): { speed: number; at?: number } {
  if (!import.meta.env.DEV) return { speed: 1 };
  const d = (window as unknown as { __crumpleDebug?: { speed?: number; at?: number } }).__crumpleDebug;
  return { speed: d?.speed ?? 1, at: d?.at };
}

/** 挂在游戏舞台上：平时什么都不画，收到 EVT.crumple 放一次特效 */
export function CrumpleOverlay() {
  const [run, setRun] = useState<{ id: number; data: CrumpleStart } | null>(null);
  useEffect(() => {
    const on = (data: CrumpleStart) => setRun({ id: performance.now(), data });
    bridge.on(EVT.crumple, on);
    return () => { bridge.off(EVT.crumple, on); };
  }, []);
  if (!run) return null;
  return <CrumpleRun key={run.id} data={run.data} onEnd={() => setRun(null)} />;
}

function CrumpleRun({ data, onEnd }: { data: CrumpleStart; onEnd: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!, layer = layerRef.current!, hand = handRef.current!;
    const stage = root.getBoundingClientRect();
    const r = getGame()?.canvas.getBoundingClientRect() ?? stage;
    const paper = { x: r.left - stage.left, y: r.top - stage.top, w: r.width, h: r.height };
    const grab = { x: paper.x + data.grab.x * paper.w, y: paper.y + data.grab.y * paper.h };
    const stage3d = acquireStage();
    const sheet = stage3d?.add(STAGE_FX.crumple, ctx => new CrumplePaper(ctx, data.grab));
    if (!stage3d || !sheet) {
      bridge.emit(EVT.crumpleDone, { fadeMs: 0 } satisfies CrumpleDone); onEnd(); return;   // 没有舞台（没有 WebGL）：不放特效，直接接着做
    }
    let frozen = false, askedFreeze = false;
    const onFrozen = () => { sheet.show(); frozen = true; };
    bridge.on(EVT.crumpleFrozen, onFrozen);

    const plan = planHand(stage.width, stage.height, grab, sheet.ballRadius);
    // 人在 3D 世界里：手交给舞台上的披风骷髅
    const deep = stage3d.isRunning(STAGE_FX.world);
    if (deep) {
      const rest = sheet.summonReaper(plan.scale);
      plan.from = { x: rest.x + paper.x, y: rest.y + paper.y };   // 手不是从画面外伸进来，是从骷髅身边伸出去
    }
    const [gx, gy] = GRAB_HAND.grip;
    hand.style.width = `${plan.w}px`; hand.style.height = `${plan.h}px`;
    hand.style.backgroundImage = `url(${GRAB_HAND.url})`;
    hand.style.backgroundSize = `${GRAB_HAND.frames * 100}% 100%`;
    hand.style.transformOrigin = `${gx * 100}% ${gy * 100}%`;

    const sfx = createCrumpleSound();
    sfx.whoosh(AT.approach, DUR.approach, 900, 250);
    sfx.crunch(AT.grab + DUR.grab * 0.6);
    sfx.crinkle(AT.grab + DUR.grab * 0.5, DUR.grab * 0.5 + DUR.crumple + DUR.squeeze);
    sfx.whoosh(AT.throw, DUR.throw + 380, 1800, 500);

    let raf = 0, fadeTimer = 0, clock = 0, last = performance.now();
    const frame = (now: number) => {
      const dbg = debugClock();
      clock += (now - last) * dbg.speed; last = now;
      let t = dbg.at ?? clock;
      // 手快碰到画面时请游戏冻住；冻住那一帧还没到就停在攥拳前等它（纸还没换上，手不能先攥）
      if (!askedFreeze && t >= AT.grab - FREEZE_LEAD) { askedFreeze = true; bridge.emit(EVT.crumpleFreeze); }
      if (!frozen && t > AT.grab) { t = AT.grab; if (dbg.at === undefined) clock = AT.grab; }
      const p = pose(t, plan);
      // 纸跟着画面一起震；纸用屏幕本地坐标（左上角是原点）
      const shake = p.shake > 0 ? { x: (Math.random() * 2 - 1) * p.shake, y: (Math.random() * 2 - 1) * p.shake } : { x: 0, y: 0 };
      sheet.set({ ...p, hand: { x: p.hand.x - paper.x, y: p.hand.y - paper.y } }, shake);
      if (p.paperGone) sheet.clear();

      if (deep) sheet.setReaper({
        x: p.handAt.x - paper.x, y: p.handAt.y - paper.y, angle: p.angle, scale: p.scale, curl: p.curl,
        rise: t / REAPER_MS.rise, opacity: (AT.fade - t) / REAPER_MS.fade,
      });
      hand.style.visibility = p.handVisible && !deep ? 'visible' : 'hidden';
      hand.style.backgroundPosition = `${p.frame / (GRAB_HAND.frames - 1) * 100}% 0`;
      hand.style.transform = `translate(${p.handAt.x - gx * plan.w}px, ${p.handAt.y - gy * plan.h}px) rotate(${p.angle}deg) scale(${p.scale})`;
      // 影子：手离纸越高，影子越远越虚（光从左上来）；外面一圈紫光，和放玩家下来的那只手一样
      const h = p.height;
      layer.style.filter = `drop-shadow(${10 + 50 * h}px ${14 + 60 * h}px ${4 + 18 * h}px rgba(0, 0, 0, ${0.5 - 0.2 * h})) drop-shadow(0 0 12px ${HAND.glow})`;
      root.style.transform = p.shake > 0 ? `translate(${shake.x}px, ${shake.y}px)` : '';

      if (t >= AT.fade && dbg.at === undefined) {
        const done: CrumpleDone = { fadeMs: DUR.fade };
        bridge.emit(EVT.crumpleDone, done);
        sheet.finish(DUR.fade);
        fadeTimer = window.setTimeout(onEnd, DUR.fade);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clearTimeout(fadeTimer); bridge.off(EVT.crumpleFrozen, onFrozen); stage3d.remove(STAGE_FX.crumple, sheet); sfx.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 每次特效只跑一遍（key 换了才重来）
  }, []);

  return (
    <div className="crumple" ref={rootRef}>
      <div className="crumple-hand-layer" ref={layerRef}>
        <div className="crumple-hand" ref={handRef} />
      </div>
    </div>
  );
}
