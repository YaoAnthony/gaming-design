// ===== 放一段音频文件（界面一侧的音效：拍标题、庆祝画面……）=====
// 和合成音共用一个出口（audio/synth）：跟着游戏的静音和总音量走。第一次放某个文件时下载、解码，之后用缓存。
// 浏览器还没让出声（玩家没按过任何键）时什么都不做。
import { openBus, type SynthBus } from './synth';

const decoded = new Map<string, Promise<AudioBuffer | null>>();
let bus: SynthBus | null = null;

function load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let p = decoded.get(url);
  if (!p) {
    p = fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).catch(() => null);
    decoded.set(url, p);
  }
  return p;
}

/** 先下载、解码好（放的时候不用等） */
export function preloadSample(url: string): void {
  bus ??= openBus(1);
  if (bus) void load(bus.ctx, url);
}

/** 放一次；volume 0..1，delayMs = 过多久再放。返回一个停掉它的函数 */
export function playSample(url: string, volume = 1, delayMs = 0): () => void {
  bus ??= openBus(1);
  const b = bus;
  if (!b) return () => {};
  let src: AudioBufferSourceNode | null = null, stopped = false;
  const at = b.now() + delayMs / 1000;
  void load(b.ctx, url).then(buffer => {
    if (!buffer || stopped) return;
    src = b.ctx.createBufferSource();
    src.buffer = buffer;
    const g = b.ctx.createGain(); g.gain.value = volume;
    src.connect(g).connect(b.input);
    src.start(Math.max(at, b.ctx.currentTime));
  });
  return () => { stopped = true; try { src?.stop(); } catch { /* 已经停了 */ } };
}
