// ===== Boss 出场的声音：用 WebAudio 现场合成，不用音频文件 =====
// 接在 Phaser 声音管理器的总输出上：游戏里静音、调总音量对它一样有效。浏览器还不让出声 / 不是 WebAudio 时什么都不做。
// （WARNING 的警报声用的是音频文件 warning.mp3，见 BossFight）
// - beep：血条涨一格「滴」一声，越往后音越高
// - title：名字亮出来那一下：低音一砸 + 一个往下沉的和弦
import type Phaser from 'phaser';

export interface BossSound {
  beep(i: number, n: number): void;
  title(): void;
}

const SILENT: BossSound = { beep() {}, title() {} };

/** 合成音整体的音量（和音效文件差不多响） */
const VOLUME = 0.22;

export function createBossSound(scene: Phaser.Scene): BossSound {
  const mgr = scene.sound as Partial<{ context: AudioContext; destination: AudioNode; masterMuteNode: AudioNode }>;
  const ac = mgr.context, out = mgr.destination ?? mgr.masterMuteNode ?? ac?.destination;
  if (!ac || !out) return SILENT;
  const master = ac.createGain();
  master.gain.value = VOLUME;
  master.connect(out);

  /** 一个音：at 秒开始、dur 秒长，频率从 f0 滑到 f1，音量极快起、指数落 */
  const tone = (at: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number) => {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.linearRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.setValueAtTime(gain, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    osc.connect(g); g.connect(master);
    osc.start(at); osc.stop(at + dur + 0.02);
  };
  const now = () => { if (ac.state === 'suspended') void ac.resume(); return ac.currentTime + 0.01; };

  return {
    beep(i, n) {
      const t = now();
      tone(t, 0.07, 'square', 620 + (i / Math.max(1, n)) * 640, 620 + (i / Math.max(1, n)) * 640, 0.35);
    },
    title() {
      const t = now();
      tone(t, 0.35, 'sine', 120, 40, 1);                                                // 低音一砸
      [196, 247, 294].forEach(f => tone(t + 0.04, 1.1, 'sawtooth', f, f * 0.94, 0.16));   // 往下沉的和弦
    },
  };
}
