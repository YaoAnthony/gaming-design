// ===== 主线剧情的音效（React 一侧放：拍标题、庆祝画面……走 audio/sample.ts，跟着游戏的总音量）=====
// 现在是 scripts/gen-story-audio.mjs 合成的占位音效；换成正式的直接覆盖 src/asset/audio/story/ 里同名的文件。
import slamUrl from './audio/story/slam.mp3';
import whooshUrl from './audio/story/whoosh.mp3';
import clickUrl from './audio/story/click.mp3';
import partyHornUrl from './audio/story/partyHorn.mp3';
import confettiUrl from './audio/story/confetti.mp3';
import corkUrl from './audio/story/cork.mp3';
import yayUrl from './audio/story/yay.mp3';
import applauseUrl from './audio/story/applause.mp3';

export const STORY_SFX = {
  /** 骷髅手把标题、按钮砸进画面 */
  slam: slamUrl,
  /** 扫走、拽进、推出 */
  whoosh: whooshUrl,
  /** 菜单换选项、按下 */
  click: clickUrl,
  /** 庆祝画面：派对喇叭、礼花、开香槟、小孩欢呼、罐头掌声 */
  partyHorn: partyHornUrl,
  confetti: confettiUrl,
  cork: corkUrl,
  yay: yayUrl,
  applause: applauseUrl,
} as const;

export type StorySfx = keyof typeof STORY_SFX;
