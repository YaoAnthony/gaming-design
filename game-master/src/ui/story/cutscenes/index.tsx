// ===== 剧情演出的实现：story/cutscenes.ts 里的每一个 id 一个组件（少一个编译不过）=====
// 游戏一侧发 EVT.storyCutscene（带上位置、要画的格子），这里放对应的那段，放完回 EVT.storyCutsceneDone。
import { useEffect, useState, type ComponentType } from 'react';
import { bridge, EVT, type StoryCutscene } from '@/protocol';
import { CUTSCENES, type CutsceneId } from '@/story/cutscenes';
import type { CutsceneProps } from './types';
import { InspectCelebration } from './InspectCelebration';
import { PullEditor } from './PullEditor';
import { DragGM } from './DragGM';
import { EditorMontage } from './EditorMontage';

export const CUTSCENE_VIEWS: Record<CutsceneId, ComponentType<CutsceneProps>> = {
  [CUTSCENES.inspectCelebration]: InspectCelebration,
  [CUTSCENES.pullEditor]: PullEditor,
  [CUTSCENES.dragGM]: DragGM,
  [CUTSCENES.editorMontage]: EditorMontage,
};

/** 听游戏一侧要放的演出，一次放一段 */
export function CutscenePlayer({ stage, stageH }: { stage: HTMLElement | null; stageH: number }) {
  const [cue, setCue] = useState<(StoryCutscene & { seq: number }) | null>(null);
  useEffect(() => {
    let seq = 0;
    const on = (c: StoryCutscene) => setCue({ ...c, seq: ++seq });
    bridge.on(EVT.storyCutscene, on);
    return () => { bridge.off(EVT.storyCutscene, on); };
  }, []);
  if (!cue || !stage) return null;
  const View = CUTSCENE_VIEWS[cue.id];
  const done = () => { setCue(c => (c?.seq === cue.seq ? null : c)); bridge.emit(EVT.storyCutsceneDone, { id: cue.id }); };
  return <View key={cue.seq} cue={cue} stage={stage} stageH={stageH} done={done} />;
}
