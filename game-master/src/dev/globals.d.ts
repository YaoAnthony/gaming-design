// ===== 开发期挂在 window 上的调试口子（只在开发版用；类型写在这里，别处不用强转）=====
export {};

declare global {
  interface Window {
    /** 控制台调试：store、Phaser 实例、自动试玩的 bot（main.tsx 挂上） */
    __climb?: Record<string, unknown>;
    /** 攥纸团慢放 / 定格：{ speed: 0.2 } 慢放，{ at: 2000 } 停在第 2000 毫秒（CrumpleOverlay 读） */
    __crumpleDebug?: { speed?: number; at?: number };
    /** 木手的 3D 画布（stage3d/hand/HandView，GmHandLayer 挂上）：看它现在的状态 */
    __gmHand?: unknown;
    /** 正在跑的 3D 世界（world3d/World3D）：看演员、人在哪 */
    __world3d?: unknown;
  }
}
