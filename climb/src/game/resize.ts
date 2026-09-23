import Phaser from 'phaser';

/**
 * 运行中改画布尺寸（换层时房间尺寸不同）。
 * Phaser 的 scale.resize 不会更新 FIT 模式的宽高比，直接调会把画面压成原来的比例，所以先把比例设对再 resize。
 */
export function resizeGame(game: Phaser.Game, w: number, h: number): void {
  const s = game.scale;
  if (s.width === w && s.height === h) return;
  s.displaySize.setAspectRatio(w / h);
  s.resize(w, h);
  s.refresh();
}
