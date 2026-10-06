// ===== 演出：GM 开始在关卡编辑器里改造游戏 =====
// 每一笔：骷髅手在物品栏点一种砖（data-story-tile），再一格格点到画布上；每点一格发 EVT.storyPaint，游戏一侧把砖画上。
import { useState } from 'react';
import { bridge, EVT } from '@/protocol';
import { GmHand, type HandState } from '../GmHand';
import { center, elementBox, spotPx, wait } from '../geometry';
import { sfx } from '../sfx';
import type { CutsceneProps } from './types';
import { useTimeline } from './useTimeline';

const T = { toTool: 380, press: 140, toCanvas: 320, cell: 115, leave: 500 };

export function EditorMontage({ cue, stage, stageH, done }: CutsceneProps) {
  const [hand, setHand] = useState<HandState | null>(null);

  useTimeline(async s => {
    const W = stage.clientWidth;
    setHand({ at: { x: W + 60, y: stage.clientHeight * 0.4 }, pose: 'point', from: 'right', ms: 0 });
    await wait(30, s);
    for (const stroke of cue.paint ?? []) {
      if (!stroke.length) continue;
      const tool = stage.querySelector(`[data-story-tile="${CSS.escape(stroke[0].tile)}"]`);
      if (tool) {
        const c = center(elementBox(stage, tool));
        setHand({ at: c, pose: 'point', from: 'right', ms: T.toTool });
        await wait(T.toTool, s);
        stage.querySelectorAll('[data-story-tile].on').forEach(e => e.classList.remove('on'));
        tool.classList.add('on', 'pressed');
        sfx('click');
        setHand({ at: { x: c.x - 6, y: c.y + 2 }, pose: 'point', from: 'right', ms: 80 });
        await wait(T.press, s);
        tool.classList.remove('pressed');
      }
      let first = true;
      for (const cell of stroke) {
        setHand({ at: spotPx(stage, cell.spot), pose: 'point', from: 'right', ms: first ? T.toCanvas : T.cell * 0.8 });
        await wait(first ? T.toCanvas : T.cell, s);
        first = false;
        bridge.emit(EVT.storyPaint, cell);
        sfx('click', 0.35);
      }
    }
    stage.querySelectorAll('[data-story-tile].on').forEach(e => e.classList.remove('on'));
    setHand({ at: { x: W + 80, y: stage.clientHeight * 0.3 }, pose: 'open', from: 'right', ms: T.leave });
    await wait(T.leave, s);
  }, done);

  return <div className="cutscene"><GmHand hand={hand} stageH={stageH} /></div>;
}
