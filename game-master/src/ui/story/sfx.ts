// 剧情界面的音效：名字 → 文件（asset/storyAudio.ts），走 audio/sample（跟着游戏的总音量）
import { STORY_SFX, type StorySfx } from '@/asset/storyAudio';
import { playSample, preloadSample } from '@/audio/sample';

export const sfx = (name: StorySfx, volume = 1, delayMs = 0): (() => void) => playSample(STORY_SFX[name], volume, delayMs);
export const preloadSfx = (...names: StorySfx[]): void => names.forEach(n => preloadSample(STORY_SFX[n]));

/** 整个舞台震一下（砸东西） */
export function shakeStage(el: HTMLElement | null, strong = false): void {
  const stage = el?.closest('.stage');
  if (!stage) return;
  const cls = strong ? 'shake-strong' : 'shake';
  stage.classList.remove('shake', 'shake-strong');
  void (stage as HTMLElement).offsetWidth;   // 重新开始动画
  stage.classList.add(cls);
  window.setTimeout(() => stage.classList.remove(cls), 320);
}
