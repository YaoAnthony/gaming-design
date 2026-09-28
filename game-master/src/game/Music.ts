// ===== 背景音乐：本层一首（层设置里选，可以是「无」）、Boss 战时临时换一首，淡入淡出切换 =====
import Phaser from 'phaser';
import { AUDIO, NO_MUSIC } from '@/asset';

const FADE_OUT_MS = 600, FADE_IN_MS = 900;

export class Music {
  private current: Phaser.Sound.BaseSound | null = null;
  private currentKey = '';
  /** 正在淡出、还没停掉的旧曲子。场景关闭时淡出的动画会被直接杀掉（不走 onComplete），要靠这里停 */
  private fading = new Set<Phaser.Sound.BaseSound>();
  /** 浏览器还没解锁音频时排着的那次切歌；场景关了要撤掉，不然解锁后旧层的歌会响 */
  private waiting: (() => void) | null = null;
  private stopped = false;
  /** 最后一次要求放的曲子：下载完的时候已经换了别的，就不放它 */
  private wantKey = '';
  /** 正在下载的曲子 */
  private loading = new Set<string>();

  /** @param base 这一层的音乐（音频 key 或 'none'） */
  constructor(private scene: Phaser.Scene, private volume: number, private base: string) {}

  /** 回到这一层的音乐（进层、Boss 打完） */
  playBase(): void { this.play(this.base); }

  /** 提前下载一首（比如这一层有 Boss，先把 Boss 曲下着），不放 */
  preload(key: string): void { this.fetch(key, () => {}); }

  /** 切到某首（已经在放就不动）；'none' = 淡出后安静；还没下载的先下载；浏览器还没解锁音频时等解锁后再放 */
  play(key: string): void {
    if (this.stopped || this.wantKey === key) return;
    this.wantKey = key;
    this.fetch(key, () => { if (!this.stopped && this.wantKey === key) this.switchTo(key); });
  }

  /** 曲子不在缓存里就用场景的加载器下载（音频清单里有的才下），下完调 done；已经有了、或者是 'none' 直接调 */
  private fetch(key: string, done: () => void): void {
    const asset = AUDIO.find(a => a.key === key);
    if (key === NO_MUSIC || !asset || this.scene.cache.audio.exists(key)) { done(); return; }
    const load = this.scene.load, ERR = Phaser.Loader.Events.FILE_LOAD_ERROR;
    const ok = `${Phaser.Loader.Events.FILE_KEY_COMPLETE}audio-${key}`;
    // 下完或者下失败都算结束（失败的话 switchTo 发现缓存里没有，就安静）
    const finish = () => { load.off(ok, finish); load.off(ERR, onError); done(); };
    const onError = (file: Phaser.Loader.File) => { if (file.key === key) finish(); };
    load.on(ok, finish);
    load.on(ERR, onError);
    if (this.loading.has(key)) return;   // 已经在下了（比如 preload 之后马上 play）：只等它下完
    this.loading.add(key);
    load.audio(key, asset.url);
    if (!load.isLoading()) load.start();
  }

  private switchTo(key: string): void {
    if (this.currentKey === key) return;
    const start = () => {
      this.waiting = null;
      if (this.stopped) return;
      this.fadeOut(this.current);
      if (key === NO_MUSIC || !this.scene.cache.audio.exists(key)) { this.current = null; this.currentKey = key; return; }
      const next = this.scene.sound.add(key, { loop: true, volume: 0 });
      next.play();
      this.scene.tweens.add({ targets: next, volume: this.volume, duration: FADE_IN_MS });
      this.current = next; this.currentKey = key;
    };
    if (this.waiting) this.scene.sound.off('unlocked', this.waiting);
    if (this.scene.sound.locked) { this.waiting = start; this.scene.sound.once('unlocked', start); } else start();
  }

  /** 音量改了：正在放的立刻跟着变 */
  setVolume(v: number): void {
    this.volume = v;
    if (this.current) { this.scene.tweens.killTweensOf(this.current); (this.current as Phaser.Sound.WebAudioSound).setVolume(v); }
  }

  /** 场景关闭：正在放的、正在淡出的都停掉，排着等解锁的撤掉 */
  stop(): void {
    this.stopped = true;
    if (this.waiting) { this.scene.sound.off('unlocked', this.waiting); this.waiting = null; }
    [...this.fading, this.current].forEach(s => this.kill(s));
    this.fading.clear();
    this.current = null; this.currentKey = '';
  }

  private fadeOut(old: Phaser.Sound.BaseSound | null): void {
    if (!old) return;
    // 旧曲可能还在淡入（刚切过来又切走）：先停掉它身上的音量动画，否则两个动画一个销毁了它、另一个还在改它的音量 → 报错
    this.scene.tweens.killTweensOf(old);
    this.fading.add(old);
    this.scene.tweens.add({ targets: old, volume: 0, duration: FADE_OUT_MS, onComplete: () => { this.fading.delete(old); this.kill(old); } });
  }

  private kill(s: Phaser.Sound.BaseSound | null): void {
    if (!s) return;
    this.scene.tweens.killTweensOf(s);
    s.stop(); s.destroy();
  }
}
