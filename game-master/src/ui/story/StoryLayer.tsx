// ===== 主线剧情在界面一侧的那一层：叠在游戏画布上（HUD 下面）=====
// - 标题画面：骷髅手一挥、房间从天上砸下来（游戏一侧发 EVT.storyHand 告诉手在哪）→ 拍标题和菜单、选「开始」（OpeningMenu）
// - 剧情演出（CutscenePlayer）
// - 第二幕套在外面的关卡编辑器（EditorShell）
// 结局画面（「你赢了！」）在 HUD 里（Hud.tsx），因为它是通关画面的一种。
import { useEffect, useRef, useState } from 'react';
import { bridge, EVT, type StoryHand } from '@/protocol';
import { useAppSelector } from '@/redux/hooks';
import { GmHand, type HandState } from './GmHand';
import { OpeningMenu } from './OpeningMenu';
import { CutscenePlayer } from './cutscenes';
import { EditorShell } from './EditorShell';
import { spotPx } from './geometry';
import { useBoxSize } from './useBox';
import { sfx } from './sfx';

type Phase = 'idle' | 'building' | 'menu';

export function StoryLayer() {
  const root = useRef<HTMLDivElement>(null);
  const { h: stageH } = useBoxSize(root);
  const mode = useAppSelector(s => s.hud.mode);
  const [phase, setPhase] = useState<Phase>('idle');
  const [buildHand, setBuildHand] = useState<HandState | null>(null);

  useEffect(() => {
    const onHand = (h: StoryHand) => {
      const el = root.current;
      if (!el) return;
      setPhase(p => (p === 'idle' ? 'building' : p));
      if (h.whoosh) sfx('whoosh');
      setBuildHand(h.spot ? { at: spotPx(el, h.spot), pose: h.pose, from: h.from ?? 'bottom', tilt: h.tilt, anchor: 'palm', ms: h.ms } : null);
    };
    const onBuilt = () => setPhase('menu');
    bridge.on(EVT.storyHand, onHand);
    bridge.on(EVT.openingBuilt, onBuilt);
    return () => { bridge.off(EVT.storyHand, onHand); bridge.off(EVT.openingBuilt, onBuilt); };
  }, []);

  // 离开了标题画面（选了开始、场景重开）：收掉
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === 'opening' && mode !== 'opening') { setPhase('idle'); setBuildHand(null); }
    prevMode.current = mode;
  }, [mode]);

  const el = root.current;
  return (
    <div ref={root} className="story-layer">
      <EditorShell stage={el} />
      {phase !== 'idle' && <GmHand hand={buildHand} stageH={stageH} />}
      {phase === 'menu' && el && <OpeningMenu stage={el} stageH={stageH} onStarted={() => setPhase('idle')} />}
      <CutscenePlayer stage={el} stageH={stageH} />
    </div>
  );
}
