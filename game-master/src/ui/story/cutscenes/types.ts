import type { StoryCutscene } from '@/protocol';

/** 一段演出拿到的东西：游戏一侧给的提示（位置、要画的格子）、舞台（坐标都相对它）、放完调 done */
export interface CutsceneProps {
  cue: StoryCutscene;
  stage: HTMLElement;
  stageH: number;
  done(): void;
}
