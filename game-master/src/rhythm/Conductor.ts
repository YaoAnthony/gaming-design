// ===== 指挥：放曲子，告诉大家现在是曲子的第几毫秒 =====
// 2D 的骷髅王和 3D 的弹幕都按它报的时间走，所以卡顿也不会跑拍（位置是按时间算的，不是一帧帧累加的）。
// 时间以音频的播放位置为准；曲子读不出来（文件不在、浏览器不让放）就按系统时钟走，每拍合成一声「嗒」。
import { endMs, type Chart } from './chart';

/** 开始之后曲子最多等多久（毫秒）还不响就不等了 */
const START_WAIT_MS = 1500;
/** 淡出时每隔多久调一次音量（毫秒） */
const FADE_STEP_MS = 40;
/** 没有曲子时打拍子的那一声：频率（赫兹）、多长（秒）、多响 */
const CLICK = { hz: 880, seconds: 0.05, gain: 0.25 };

export class Conductor {
  private readonly audio: HTMLAudioElement;
  /** 曲子能不能放；null = 还不知道 */
  private usable: boolean | null = null;
  private startedAt: number | null = null;
  private clicks: AudioContext | null = null;
  private lastBeat = -1;

  /** @param url 曲子的完整地址 */
  constructor(private readonly chart: Chart, url: string, volume: number) {
    this.audio = new Audio(url);
    this.audio.preload = 'auto';
    this.audio.volume = volume;
    this.audio.addEventListener('canplaythrough', () => { this.usable ??= true; }, { once: true });
    this.audio.addEventListener('error', () => { this.usable = false; }, { once: true });
  }

  get started(): boolean { return this.startedAt !== null; }

  /** 开始放（从头） */
  start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = performance.now();
    if (this.usable === false) return;
    this.audio.currentTime = 0;
    this.audio.play().catch(() => { this.usable = false; });
  }

  /** 现在是曲子的第几毫秒；还没开始是 0 */
  timeMs(): number {
    if (this.startedAt === null) return 0;
    const wall = performance.now() - this.startedAt;
    if (this.usable !== false && !this.audio.paused && this.audio.currentTime > 0) return this.audio.currentTime * 1000;
    // 曲子迟迟不响（浏览器不让自动播放、文件一直读不出来）：不等了，按系统时钟走
    if (this.usable !== false && wall > START_WAIT_MS && this.audio.currentTime === 0) { this.usable = false; this.audio.pause(); }
    if (this.usable === false) this.click(wall);
    return this.usable === false ? wall : 0;   // 曲子还在起播：先停在 0，等它真的响了再走
  }

  /** 谱面走完了 */
  get finished(): boolean { return this.timeMs() >= endMs(this.chart); }

  /** 停。fadeMs > 0：曲子用这么久慢慢小下去再停，不是戛然而止 */
  stop(fadeMs = 0): void {
    void this.clicks?.close();
    this.clicks = null;
    const audio = this.audio, from = audio.volume, t0 = performance.now();
    const halt = () => { audio.pause(); audio.removeAttribute('src'); };
    if (fadeMs <= 0 || audio.paused) { halt(); return; }
    const timer = window.setInterval(() => {
      const k = (performance.now() - t0) / fadeMs;
      if (k >= 1) { window.clearInterval(timer); halt(); } else audio.volume = from * (1 - k) ** 2;
    }, FADE_STEP_MS);
  }

  /** 没有曲子：每过一拍合成一声 */
  private click(ms: number): void {
    const beat = Math.floor((ms - this.chart.offsetMs) / (60000 / this.chart.bpm));
    if (beat <= this.lastBeat || beat < 0) return;
    this.lastBeat = beat;
    try {
      this.clicks ??= new AudioContext();
      const ctx = this.clicks, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = CLICK.hz * (beat % 4 === 0 ? 1.5 : 1);   // 小节头高一点
      gain.gain.setValueAtTime(CLICK.gain * this.audio.volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + CLICK.seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + CLICK.seconds);
    } catch { /* 浏览器不让出声：那就没有声音 */ }
  }
}
