// ===== 背景音乐：平时一首、Boss 一首，淡入淡出切换 =====
import type Phaser from 'phaser';

export class Music {
  private current: Phaser.Sound.BaseSound | null = null;
  private currentKey = '';

  constructor(private scene: Phaser.Scene, private volume: number) {}

  /** 切到某首（已经在放就不动）；浏览器还没解锁音频时等解锁后再放 */
  play(key: string): void {
    if (this.currentKey === key) return;
    const start = () => {
      const old = this.current;
      if (old) { this.scene.tweens.add({ targets: old, volume: 0, duration: 600, onComplete: () => { old.stop(); old.destroy(); } }); }
      const next = this.scene.sound.add(key, { loop: true, volume: 0 });
      next.play();
      this.scene.tweens.add({ targets: next, volume: this.volume, duration: 900 });
      this.current = next; this.currentKey = key;
    };
    if (this.scene.sound.locked) this.scene.sound.once('unlocked', start); else start();
  }

  stop(): void {
    this.current?.stop(); this.current?.destroy();
    this.current = null; this.currentKey = '';
  }
}
