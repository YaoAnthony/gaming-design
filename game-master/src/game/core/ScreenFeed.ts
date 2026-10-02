// ===== 把游戏画布交给 3D 舞台（protocol 的 ScreenSource 在 Phaser 这一侧的实现）=====
import Phaser from 'phaser';
import type { ScreenSource } from '@/protocol';

export function screenFeed(game: Phaser.Game): ScreenSource {
  return {
    canvas: game.canvas,
    onFrame(fn) {
      game.events.on(Phaser.Core.Events.POST_RENDER, fn);
      return () => { game.events.off(Phaser.Core.Events.POST_RENDER, fn); };
    },
    setVisible(visible) { game.canvas.style.visibility = visible ? '' : 'hidden'; },
  };
}
