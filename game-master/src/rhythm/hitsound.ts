// ===== 打击音：每次判定当场出一声（WebAudio 现场合成，不用音频文件）=====
// 音游的手感一半在这一声上：按下去立刻有回应，准不准一听就知道。
// Perfect 是清脆的一声高音，Good 低一点、闷一点，Miss 是一声低沉的「噗」。

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

/** volume：总音量 0..1。浏览器不让出声（不支持、还没交互过）时什么都不做 */
export function createHitsound(volume: number): Hitsound {
  let ctx: AudioContext | null = null;
  try { ctx = new AudioContext(); } catch { /* 没有声音 */ }
  return {
    play(kind) {
      if (!ctx || ctx.state === 'closed') return;
      const t = TONE[kind], now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = t.wave;
      osc.frequency.setValueAtTime(t.hz, now);
      osc.frequency.exponentialRampToValueAtTime(t.hz * 0.6, now + t.seconds);   // 音高往下滑一点：像敲了一下，不像蜂鸣
      gain.gain.setValueAtTime(t.gain * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + t.seconds);
    },
    close() { void ctx?.close(); ctx = null; },
  };
}
