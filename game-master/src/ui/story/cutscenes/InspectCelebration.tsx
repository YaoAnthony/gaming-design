// ===== 演出：GM 检查庆祝画面 =====
// 骷髅手把庆祝画面从左边拽进屏幕 → 从上往下摸，停在「继续」按钮上 → 紧张地发抖 → 一把攥住，揉成纸团，甩出屏幕 → 把庆祝画面推出右边。
import { useRef, useState, type CSSProperties } from 'react';
import { Celebration } from '../Celebration';
import { GmHand, type HandState } from '../GmHand';
import { center, elementBox, wait } from '../geometry';
import { sfx } from '../sfx';
import { createCrumpleSound } from '@/ui/crumple/crumpleSound';
import type { CutsceneProps } from './types';
import { useTimeline } from './useTimeline';

/** 各段多久（毫秒） */
const T = { drag: 850, settle: 250, toTop: 400, scan: 1500, tremble: 1000, grab: 220, crumple: 650, windup: 180, fling: 160, fly: 650, toEdge: 380, push: 650 };

export function InspectCelebration({ stage, stageH, done }: CutsceneProps) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const [panel, setPanel] = useState({ x: -W, ms: 0 });
  const [hand, setHand] = useState<HandState | null>(null);
  const [btn, setBtn] = useState<'idle' | 'crumpling' | 'gone'>('idle');
  const [ball, setBall] = useState<{ x: number; y: number; size: number; ms: number; spin: number } | null>(null);
  const cont = useRef<HTMLButtonElement>(null);

  useTimeline(async s => {
    // 拽进来：手捏着画面的右边缘
    setHand({ at: { x: 0, y: H * 0.5 }, pose: 'pinch', from: 'left', ms: 0 });
    await wait(30, s);
    sfx('whoosh');
    setPanel({ x: 0, ms: T.drag });
    setHand({ at: { x: W - 12, y: H * 0.5 }, pose: 'pinch', from: 'left', ms: T.drag });
    await wait(T.drag + T.settle, s);
    // 松手，从上往下摸到「继续」
    const b = cont.current ? elementBox(stage, cont.current) : { x: W / 2 - 60, y: H * 0.6, w: 120, h: 40 };
    const c = center(b);
    setHand({ at: { x: c.x, y: H * 0.04 }, pose: 'point', from: 'left', ms: T.toTop });
    await wait(T.toTop, s);
    setHand({ at: { x: c.x, y: c.y }, pose: 'point', from: 'left', ms: T.scan });
    await wait(T.scan, s);
    // 发抖
    setHand({ at: { x: c.x, y: c.y }, pose: 'point', from: 'left', ms: 0, tremble: true });
    await wait(T.tremble, s);
    // 攥住、揉成团
    const sound = createCrumpleSound();
    sound.crunch(0); sound.crinkle(60, T.crumple);
    setHand({ at: c, pose: 'fist', from: 'left', anchor: 'palm', ms: T.grab });
    setBtn('crumpling');
    await wait(T.grab + T.crumple, s);
    setBtn('gone');
    const size = Math.min(b.h * 1.1, 60);
    setBall({ x: c.x, y: c.y, size, ms: 0, spin: 0 });
    // 往回收、甩出去：纸团飞出右上角
    const wind = { x: c.x - W * 0.06, y: c.y + H * 0.05 };
    setHand({ at: wind, pose: 'fist', from: 'left', anchor: 'palm', ms: T.windup, tilt: -12 });
    setBall({ ...wind, size, ms: T.windup, spin: -40 });
    await wait(T.windup, s);
    sound.whoosh(0, T.fling + 200, 400, 2400);
    setHand({ at: { x: c.x + W * 0.08, y: c.y - H * 0.12 }, pose: 'open', from: 'left', anchor: 'palm', ms: T.fling, tilt: 22 });
    setBall({ x: W + 120, y: -120, size: size * 0.7, ms: T.fly, spin: 900 });
    await wait(T.fly, s);
    sound.close();
    setBall(null);
    // 把画面推出右边
    setHand({ at: { x: 30, y: H * 0.5 }, pose: 'open', from: 'left', anchor: 'palm', ms: T.toEdge });
    await wait(T.toEdge, s);
    sfx('whoosh');
    setPanel({ x: W * 1.1, ms: T.push });
    setHand({ at: { x: W * 1.1 + 30, y: H * 0.5 }, pose: 'open', from: 'left', anchor: 'palm', ms: T.push });
    await wait(T.push + 100, s);
  }, done);

  const panelStyle: CSSProperties = { transform: `translateX(${panel.x}px)`, transition: panel.ms ? `transform ${panel.ms}ms cubic-bezier(.3, .8, .3, 1)` : 'none' };
  return (
    <div className="cutscene">
      <div className="cs-panel" style={panelStyle}>
        <Celebration inspect choices={['continue', 'restart', 'quit']} continueRef={cont} crumpled={btn !== 'idle'} />
        {btn === 'crumpling' && <div className="cs-crumpling" style={cont.current ? boxStyle(elementBox(stage, cont.current), panel.x) : undefined}>{cont.current?.textContent}</div>}
      </div>
      {ball && <div className="cs-ball" style={{
        width: ball.size, height: ball.size,
        transform: `translate(${ball.x - ball.size / 2}px, ${ball.y - ball.size / 2}px) rotate(${ball.spin}deg)`,
        transition: ball.ms ? `transform ${ball.ms}ms cubic-bezier(.2, .6, .4, 1), width ${ball.ms}ms, height ${ball.ms}ms` : 'none',
      }} />}
      <GmHand hand={hand} stageH={stageH} />
    </div>
  );
}

/** 揉的那一下：盖在按钮原来的位置上（相对画面板） */
const boxStyle = (b: { x: number; y: number; w: number; h: number }, panelX: number): CSSProperties => ({ left: b.x - panelX, top: b.y, width: b.w, height: b.h });
