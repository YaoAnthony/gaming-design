// ===== Boss 出场的声音：用 WebAudio 现场合成，不用音频文件（共用 audio/synth 的出口：跟着游戏的静音和总音量走）=====
// 史莱姆王出场、节奏关卡开打前填血条都用它。浏览器还不让出声 / 不支持 WebAudio 时什么都不做。
// （WARNING 的警报声用的是音频文件 warning.mp3，见 BossFight）
// - beep：血条涨一格「滴」一声，越往后音越高
// - title：名字亮出来那一下：低音一砸 + 一个往下沉的和弦
import { openBus, tone } from './synth';

export interface BossSound {
  beep(i: number, n: number): void;
  title(): void;
  /** 用完断开这一路（不关共用的 AudioContext） */
  close(): void;
}

/** 合成音整体的音量（和音效文件差不多响） */
const VOLUME = 0.22;

export function createBossSound(): BossSound {
  const bus = openBus(VOLUME);
  if (!bus) return { beep() {}, title() {}, close() {} };
  const note = (at: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number) => tone(bus, { at, dur, type, f0, f1, gain, attack: 0.01 });
  return {
    beep(i, n) {
      const f = 620 + (i / Math.max(1, n)) * 640;
      note(bus.now(), 0.07, 'square', f, f, 0.35);
    },
    title() {
      const t = bus.now();
      note(t, 0.35, 'sine', 120, 40, 1);                                                // 低音一砸
      [196, 247, 294].forEach(f => note(t + 0.04, 1.1, 'sawtooth', f, f * 0.94, 0.16));   // 往下沉的和弦
    },
    close() { bus.close(); },
  };
}
