// ===== 游戏画面的来源：2D 游戏把自己的画布交给 3D 舞台当贴图 =====
// Phaser 一侧实现（game/core/ScreenFeed.ts），舞台一侧只认这个接口

export interface ScreenSource {
  /** 游戏的画布：像素尺寸是 width / height，页面上占多大看它的 getBoundingClientRect */
  readonly canvas: HTMLCanvasElement;
  /**
   * 每画完一帧调一次。这时画布刚画完、还没交给浏览器合成，别的 WebGL 上下文读得到它，
   * 所以舞台要在这个回调里取画面、画自己。返回退订函数
   */
  onFrame(fn: () => void): () => void;
  /** 藏起 / 显示游戏画布：藏起来照常画，只是不直接给玩家看（由舞台代为显示） */
  setVisible(visible: boolean): void;
}
