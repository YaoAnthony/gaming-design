// ===== 舞台特效的注册表：每个特效一个文件夹，在 fx/index.ts 里注册（和 game/mechanics/define.ts 同一套做法）=====
import type * as THREE from 'three';
import type { StageFxId } from '@/protocol';
import type { Stage3DConfig } from '@/type';
import type { ScreenPlane } from '../ScreenPlane';

/** 特效拿得到的东西 */
export interface StageFxContext {
  /** 游戏画面那块屏幕 */
  screen: ScreenPlane;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 每次现取：调参面板改了立刻生效 */
  config(): Stage3DConfig;
  /** 相机摆回原位（正对屏幕，屏幕上一个单位 = 页面上一个像素）：动过相机的特效收场时调 */
  resetCamera(): void;
}

/** 放着的一次特效 */
export interface StageFxRun {
  /** 每帧调；返回 false = 放完了，舞台把它撤掉 */
  update(dtMs: number): boolean;
  /** 请它收场（比如倒下去的画面扶起来）；收完 update 返回 false */
  end(): void;
  /** 撤掉时把自己加进场景的东西清干净 */
  dispose?(): void;
}

export interface StageFxDef {
  id: StageFxId;
  start(ctx: StageFxContext): StageFxRun;
}

const defs = new Map<StageFxId, StageFxDef>();

/** 同一个 id 再注册就换成新的（开发期热更新会把特效文件重新跑一遍） */
export function defineStageFx(def: StageFxDef): void { defs.set(def.id, def); }

export const getStageFx = (id: StageFxId): StageFxDef | undefined => defs.get(id);
