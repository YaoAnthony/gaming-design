// ===== 第四面墙：整个画面被攥成纸团（特效本身在 React 的 CrumpleOverlay，这里管游戏这一侧的冻住 / 恢复）=====
// 流程：start 发 EVT.crumple，游戏照常跑、骷髅手先伸进来；手碰到画面时特效发 EVT.crumpleFreeze，这里冻住，冻住的那一帧画出来后回 EVT.crumpleFrozen；
// 纸团扔掉后特效发 EVT.crumpleDone，这里恢复并做说好的事（比如重置房间），fadeMs = 新画面淡入要多久
import Phaser from 'phaser';
import { bridge, EVT, type CrumpleDone } from '@/protocol';

export class CrumpleFx {
  /** 特效放着 / 已经冻住了 */
  active = false;
  private frozen = false;
  private after: ((fadeMs: number) => void) | null = null;

  /** @param onFreeze 冻住之前要做的（关掉对话框） */
  constructor(private readonly scene: Phaser.Scene, private readonly onFreeze: () => void) {}

  /** 放特效。grab = 攥住的位置（画面的比例坐标）。没放成（正在放、没有挂特效层）返回 false */
  start(after: ((fadeMs: number) => void) | undefined, grab = { x: 0.5, y: 0.5 }): boolean {
    if (this.active) return false;
    if (bridge.listenerCount(EVT.crumple) === 0) return false;
    this.active = true;
    this.after = after ?? null;
    bridge.emit(EVT.crumple, { grab });
    return true;
  }

  /**
   * 冻住：场景暂停、声音停；等下一帧画完（对话框已经关掉）再告诉特效。
   * 特效把屏幕换成一张纸，摆在原位和冻住的画面一模一样，换上去看不出来
   */
  freeze(): void {
    if (this.frozen) return;
    this.active = true; this.frozen = true;
    this.onFreeze();
    this.scene.sound.pauseAll();
    this.scene.scene.pause();
    this.scene.game.events.once(Phaser.Core.Events.POST_RENDER, () => { bridge.emit(EVT.crumpleFrozen); });
  }

  end(d: CrumpleDone): void {
    if (!this.active) return;
    this.active = false;
    if (this.frozen) { this.frozen = false; this.scene.sound.resumeAll(); this.scene.scene.resume(); }
    const after = this.after;
    this.after = null;
    after?.(d.fadeMs);
  }
}
