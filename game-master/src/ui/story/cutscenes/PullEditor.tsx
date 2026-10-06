// ===== 演出：GM 把关卡编辑器拉出来，把主角拖进编辑器里对应的位置 =====
// 游戏一侧已经把主角藏起来了（换成这里手拎着的那张图）。骷髅手从上面伸下来捏住主角、拎起来 →
// 编辑器从四周套上来、游戏画面缩进编辑器的画布里 → 手把主角放回画布里同一个位置（画面缩小了，人跟着缩小）。
import { useState } from 'react';
import { store } from '@/redux/store';
import { setEditorShell } from '@/redux/slices/hudSlice';
import { GmHand, type HandState } from '../GmHand';
import { canvasBox, wait } from '../geometry';
import { sfx } from '../sfx';
import { EDITOR_SHELL_MS } from '../EditorShell';
import { carriedStyle, imageUrl, type Carried } from './carry';
import type { CutsceneProps } from './types';
import { useTimeline } from './useTimeline';

const T = { reach: 550, pinch: 160, lift: 320, carry: 700, place: 220, leave: 450 };
/** 拎起来多高（舞台高的比例） */
const LIFT = 0.12;

export function PullEditor({ cue, stage, stageH, done }: CutsceneProps) {
  const [hand, setHand] = useState<HandState | null>(null);
  const [hero, setHero] = useState<Carried | null>(() => {
    const h = cue.hero, b = canvasBox(stage);
    return h ? { x: b.x + h.x * b.w, y: b.y + h.y * b.h, w: h.w * b.w, h: h.h * b.h, ms: 0, url: imageUrl(h.texture) } : null;
  });

  useTimeline(async s => {
    const h = cue.hero;
    if (!h || !hero) return;
    const top = (c: Carried) => ({ x: c.x, y: c.y - c.h / 2 });
    setHand({ at: { x: hero.x, y: -40 }, pose: 'open', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(30, s);
    setHand({ at: top(hero), pose: 'open', from: 'top', anchor: 'pinch', ms: T.reach });
    await wait(T.reach, s);
    setHand({ at: top(hero), pose: 'pinch', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(T.pinch, s);
    const up = { ...hero, y: hero.y - stageH * LIFT, ms: T.lift };
    setHero(up); setHand({ at: top(up), pose: 'pinch', from: 'top', anchor: 'pinch', ms: T.lift });
    await wait(T.lift, s);
    // 编辑器套上来
    sfx('whoosh');
    store.dispatch(setEditorShell({ on: true, gm: false }));
    await wait(EDITOR_SHELL_MS + 80, s);
    // 放回画布里对应的位置
    const b = canvasBox(stage);
    const dest: Carried = { ...hero, x: b.x + h.x * b.w, y: b.y + h.y * b.h, w: h.w * b.w, h: h.h * b.h, ms: T.carry };
    const hover = { ...dest, y: dest.y - stageH * LIFT * 0.5 };
    setHero(hover); setHand({ at: top(hover), pose: 'pinch', from: 'top', anchor: 'pinch', ms: T.carry });
    await wait(T.carry, s);
    setHero({ ...dest, ms: T.place }); setHand({ at: top(dest), pose: 'pinch', from: 'top', anchor: 'pinch', ms: T.place });
    await wait(T.place, s);
    sfx('click');
    setHand({ at: top(dest), pose: 'open', from: 'top', anchor: 'pinch', ms: 0 });
    await wait(120, s);
    setHand({ at: { x: dest.x, y: -60 }, pose: 'open', from: 'top', anchor: 'pinch', ms: T.leave });
    await wait(T.leave, s);
  }, done);

  return (
    <div className="cutscene">
      {hero && <div className="cs-carried" style={carriedStyle(hero)} />}
      <GmHand hand={hand} stageH={stageH} />
    </div>
  );
}
