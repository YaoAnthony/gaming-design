// ===== 现场合成的音效共用的底子（不依赖任何引擎）=====
// 打击音、节拍器、捏纸团、Boss 的「滴」都是 WebAudio 现场合成的。它们共用一个 AudioContext，接在同一个出口上：
// 游戏启动后（BootScene）出口换成 Phaser 声音管理器的总线——跟着游戏的静音和总音量走；
// 那之前（或者没有 Phaser 的时候）自己开一个 AudioContext 接到扬声器上。
// 浏览器同时能开的 AudioContext 有上限，每开一个还多一条音频线程：不要在别处 new AudioContext。

interface Output { ctx: AudioContext; node: AudioNode }
let output: Output | null = null;

/** 游戏这一侧把出口接到 Phaser 的总线上（BootScene 调一次） */
export function setAudioOutput(ctx: AudioContext, node: AudioNode): void { output = { ctx, node }; }

/** 现在的出口；还没有就自己开一个。浏览器不支持 WebAudio 返回 null */
function currentOutput(): Output | null {
  if (!output) {
    try { const ctx = new AudioContext(); output = { ctx, node: ctx.destination }; } catch { return null; }
  }
  if (output.ctx.state === 'suspended') void output.ctx.resume().catch(() => {});
  return output;
}

/** 一路音效：有自己的音量，接在共用的出口上。用完 close（只断开这一路，不关共用的 AudioContext） */
export interface SynthBus {
  readonly ctx: AudioContext;
  /** 接到这里的声音都走这一路的音量 */
  readonly input: AudioNode;
  /** 现在的音频时钟（秒），稍微往后一点：马上要放的声音从这里开始排 */
  now(): number;
  setVolume(v: number): void;
  close(): void;
}

/** 开一路音效；浏览器不支持 WebAudio 返回 null（调用方当作没有声音） */
export function openBus(volume: number): SynthBus | null {
  const out = currentOutput();
  if (!out) return null;
  const { ctx } = out, gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(out.node);
  let open = true;
  return {
    ctx, input: gain,
    now: () => ctx.currentTime + 0.01,
    setVolume: v => { gain.gain.value = v; },
    close: () => { if (open) { open = false; gain.disconnect(); } },
  };
}

export interface ToneOptions {
  /** 从 at 秒开始、持续 dur 秒 */
  at: number;
  dur: number;
  type: OscillatorType;
  /** 频率从 f0 滑到 f1（赫兹）；exp = 指数滑（听着像「敲」），默认线性 */
  f0: number;
  f1?: number;
  glide?: 'linear' | 'exp';
  gain: number;
  /** 起音多快（秒）；0 = 一下就到 */
  attack?: number;
}

/** 一个音：音量极快起、指数落 */
export function tone(bus: SynthBus, o: ToneOptions): void {
  const { ctx } = bus, osc = ctx.createOscillator(), g = ctx.createGain(), end = o.at + o.dur, f1 = o.f1 ?? o.f0;
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, o.at);
  if (f1 !== o.f0) { if (o.glide === 'exp') osc.frequency.exponentialRampToValueAtTime(f1, end); else osc.frequency.linearRampToValueAtTime(f1, end); }
  const attack = o.attack ?? 0;
  if (attack > 0) { g.gain.setValueAtTime(0, o.at); g.gain.linearRampToValueAtTime(o.gain, o.at + attack); g.gain.setValueAtTime(o.gain, o.at + Math.max(attack, o.dur * 0.7)); }
  else g.gain.setValueAtTime(o.gain, o.at);
  g.gain.exponentialRampToValueAtTime(0.0005, end);
  osc.connect(g).connect(bus.input);
  osc.start(o.at); osc.stop(end + 0.02);
}

/** 一秒长的白噪声（按 AudioContext 缓存一份，捏纸团之类的噪声音效从里面截一段用） */
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}
