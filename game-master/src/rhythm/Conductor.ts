// ===== 指挥：放曲子，告诉大家现在是曲子的第几毫秒 =====
// 2D 的骷髅王和 3D 的弹幕都按它报的时间走，所以卡顿也不会跑拍（位置是按时间算的，不是一帧帧累加的）。
// 时间以音频的播放位置为准；曲子读不出来（文件不在、浏览器不让放）就按系统时钟走，每拍合成一声「嗒」。
import { endMs, type Chart } from './chart';

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
    if (this.usable === false) this.click(wall);
    return this.usable === false ? wall : 0;   // 曲子还在起播：先停在 0，等它真的响了再走
  }

  /** 谱面走完了 */
  get finished(): boolean { return this.timeMs() >= endMs(this.chart); }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    void this.clicks?.close();
    this.clicks = null;
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
