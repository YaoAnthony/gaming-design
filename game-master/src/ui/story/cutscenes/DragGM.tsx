// ===== 演出：GM 把自己的化身（城堡前面那个骷髅 NPC）也拖进关卡编辑器 =====
// 游戏一侧已经把 GM 藏起来了。骷髅手捏住他的头、拎起来，放进编辑器物品栏里那一格（data-story-slot="gm"），他在那里缩成一个图标。
import { useState } from 'react';
import { store } from '@/redux/store';
import { setEditorShell } from '@/redux/slices/hudSlice';
import { GmHand, type HandState } from '../GmHand';
import { canvasBox, center, elementBox, wait } from '../geometry';
import { sfx } from '../sfx';
import { carriedStyle, imageUrl, type Carried } from './carry';
import type { CutsceneProps } from './types';
import { useTimeline } from './useTimeline';

const T = { reach: 550, pinch: 160, lift: 300, carry: 850, drop: 200, leave: 450 };

export function DragGM({ cue, stage, stageH, done }: CutsceneProps) {
  const [hand, setHand] = useState<HandState | null>(null);
  const [gm, setGm] = useState<Carried | null>(() => {
    const g = cue.gm, b = canvasBox(stage);
    return g ? { x: b.x + g.x * b.w, y: b.y + g.y * b.h, w: g.w * b.w, h: g.h * b.h, ms: 0, url: imageUrl(g.texture) } : null;
  });

  useTimeline(async s => {
    if (!gm) return;
    const top = (c: Carried) => ({ x: c.x, y: c.y - c.h / 2 });
    setHand({ at: { x: gm.x, y: -40 }, pose: 'open', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(30, s);
    setHand({ at: top(gm), pose: 'open', from: 'top', anchor: 'pinch', ms: T.reach });
    await wait(T.reach, s);
    setHand({ at: top(gm), pose: 'pinch', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(T.pinch, s);
    const up = { ...gm, y: gm.y - stageH * 0.15, ms: T.lift };
    setGm(up); setHand({ at: top(up), pose: 'pinch', from: 'top', anchor: 'pinch', ms: T.lift });
    await wait(T.lift, s);
    // 拎到物品栏那一格，缩成图标
    const slot = stage.querySelector('[data-story-slot="gm"]');
    const sb = slot ? elementBox(stage, slot) : { x: stage.clientWidth - 60, y: 80, w: 40, h: 40 };
    const c = center(sb), k = Math.min(sb.w / gm.w, sb.h / gm.h) * 0.8;
    const dest: Carried = { ...gm, x: c.x, y: c.y, w: gm.w * k, h: gm.h * k, ms: T.carry };
    sfx('whoosh');
    setGm(dest); setHand({ at: top(dest), pose: 'pinch', from: 'top', anchor: 'pinch', ms: T.carry });
    await wait(T.carry, s);
    sfx('click');
    store.dispatch(setEditorShell({ on: true, gm: true }));
    setGm({ ...dest, hidden: true, ms: 0 });
    setHand({ at: top(dest), pose: 'open', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(T.drop, s);
    setHand({ at: { x: dest.x, y: -60 }, pose: 'open', from: 'top', anchor: 'pinch', ms: T.leave });
    await wait(T.leave, s);
  }, done);

  return (
    <div className="cutscene">
      {gm && <div className="cs-carried" style={carriedStyle(gm)} />}
      <GmHand hand={hand} stageH={stageH} />
    </div>
  );
}
