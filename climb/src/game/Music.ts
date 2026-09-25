// ===== 背景音乐：本层一首（层设置里选，可以是「无」）、Boss 战时临时换一首，淡入淡出切换 =====
import type Phaser from 'phaser';
import { NO_MUSIC } from '@/asset';

export class Music {
  private current: Phaser.Sound.BaseSound | null = null;
  private currentKey = '';

  /** @param base 这一层的音乐（音频 key 或 'none'） */
  constructor(private scene: Phaser.Scene, private volume: number, private base: string) {}

  /** 回到这一层的音乐（进层、Boss 打完） */
  playBase(): void { this.play(this.base); }

  /** 切到某首（已经在放就不动）；'none' = 淡出后安静；浏览器还没解锁音频时等解锁后再放 */
  play(key: string): void {
    if (this.currentKey === key) return;
    const start = () => {
      const old = this.current;
      // 旧曲可能还在淡入（刚切过来又切走）：先停掉它身上的音量动画，否则两个动画一个销毁了它、另一个还在改它的音量 → 报错
      if (old) { this.scene.tweens.killTweensOf(old); this.scene.tweens.add({ targets: old, volume: 0, duration: 600, onComplete: () => { old.stop(); old.destroy(); } }); }
      if (key === NO_MUSIC || !this.scene.cache.audio.exists(key)) { this.current = null; this.currentKey = key; return; }
      const next = this.scene.sound.add(key, { loop: true, volume: 0 });
      next.play();
      this.scene.tweens.add({ targets: next, volume: this.volume, duration: 900 });
      this.current = next; this.currentKey = key;
    };
    if (this.scene.sound.locked) this.scene.sound.once('unlocked', start); else start();
  }

  /** 音量改了：正在放的立刻跟着变 */
  setVolume(v: number): void {
    this.volume = v;
    if (this.current) { this.scene.tweens.killTweensOf(this.current); (this.current as Phaser.Sound.WebAudioSound).setVolume(v); }
  }

  stop(): void {
    if (this.current) this.scene.tweens.killTweensOf(this.current);
    this.current?.stop(); this.current?.destroy();
    this.current = null; this.currentKey = '';
  }
}
