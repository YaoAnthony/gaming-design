// ===== 打击音：每次判定当场出一声（WebAudio 现场合成，不用音频文件；共用 audio/synth 的出口）=====
// 音游的手感一半在这一声上：按下去立刻有回应，准不准一听就知道。
// Perfect 是清脆的一声高音，Good 低一点、闷一点，Miss 是一声低沉的「噗」。
import { openBus, tone } from '@/audio/synth';

/** 每种判定：音高（赫兹）、多长（秒）、多响、波形 */
const TONE = {
  perfect: { hz: 1320, seconds: 0.07, gain: 0.32, wave: 'triangle' },
  good: { hz: 880, seconds: 0.06, gain: 0.24, wave: 'triangle' },
  miss: { hz: 150, seconds: 0.12, gain: 0.2, wave: 'sawtooth' },
} as const;

export interface Hitsound {
  play(kind: keyof typeof TONE): void;
  close(): void;
}

/** volume：这一路的音量 0..1。浏览器不让出声（不支持、还没交互过）时什么都不做 */
export function createHitsound(volume: number): Hitsound {
  const bus = openBus(volume);
  return {
    play(kind) {
      if (!bus) return;
      const t = TONE[kind];
      // 音高往下滑一点：像敲了一下，不像蜂鸣
      tone(bus, { at: bus.now(), dur: t.seconds, type: t.wave, f0: t.hz, f1: t.hz * 0.6, glide: 'exp', gain: t.gain });
    },
    close() { bus?.close(); },
  };
}
