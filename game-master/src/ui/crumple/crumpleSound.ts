// ===== 捏纸团的声音：用 WebAudio 现场合成，不用音频文件 =====
// 揉纸声 = 一连串几毫秒到几十毫秒的白噪声脉冲，每个过一个随机频率的带通滤波；偶尔夹一声低一点、长一点的「咔」。
// 呼的一声 = 一段噪声，带通频率从高滑到低，音量先起后落。

/** 总音量 */
const VOLUME = 0.5;

export interface CrumpleSound {
  /** 手伸进来 / 拿走时带起的风声 */
  whoosh(atMs: number, durMs: number, from: number, to: number): void;
  /** 捏住那一下 */
  crunch(atMs: number): void;
  /** 揉纸：从 atMs 开始持续 durMs，中间最密 */
  crinkle(atMs: number, durMs: number): void;
  close(): void;
}

/** 时间都是从调用这个函数的那一刻算起的毫秒；浏览器不让出声（没交互过、不支持）时什么都不做 */
export function createCrumpleSound(): CrumpleSound {
  let ctx: AudioContext | null = null;
  try { ctx = new AudioContext(); } catch { /* 不支持 WebAudio */ }
  if (!ctx) return { whoosh() {}, crunch() {}, crinkle() {}, close() {} };
  const ac = ctx;
  if (ac.state === 'suspended') void ac.resume();
  const t0 = ac.currentTime + 0.02;
  const master = ac.createGain();
  master.gain.value = VOLUME;
  master.connect(ac.destination);
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  /** 一段滤过的噪声，音量包络：极快起、指数衰减 */
  const burst = (at: number, dur: number, freq: number, q: number, gain: number) => {
    const src = ac.createBufferSource(); src.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(at, Math.random() * 0.9, dur + 0.02);
  };
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  return {
    whoosh(atMs, durMs, from, to) {
      const at = t0 + atMs / 1000, dur = durMs / 1000;
      const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(from, at); bp.frequency.exponentialRampToValueAtTime(to, at + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.22, at + dur * 0.55);
      g.gain.linearRampToValueAtTime(0, at + dur);
      src.connect(bp).connect(g).connect(master);
      src.start(at); src.stop(at + dur + 0.05);
    },
    crunch(atMs) {
      const at = t0 + atMs / 1000;
      burst(at, 0.12, 700, 0.7, 0.9);
      for (let i = 0; i < 6; i++) burst(at + rand(0, 0.08), rand(0.01, 0.03), rand(2000, 6000), rand(0.8, 2), rand(0.2, 0.45));
    },
    crinkle(atMs, durMs) {
      const at = t0 + atMs / 1000, dur = durMs / 1000;
      for (let t = 0; t < dur;) {
        const k = Math.sin(Math.PI * t / dur);           // 中间最密、最响
        if (Math.random() < 0.12) burst(at + t, rand(0.04, 0.09), rand(500, 1400), rand(0.6, 1.2), 0.25 + 0.5 * k);
        else burst(at + t, rand(0.006, 0.03), rand(1800, 7000), rand(0.7, 2.5), rand(0.08, 0.35) * (0.4 + 0.6 * k));
        t += -Math.log(1 - Math.random()) / (25 + 70 * k);   // 泊松间隔：平均每秒 25~95 下
      }
    },
    close() { void ac.close(); },
  };
}
