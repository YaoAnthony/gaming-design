// ===== 创建 / 销毁 Phaser 实例（React 组件调用）=====
import Phaser from 'phaser';
import '@/game/registry/tiles';    // 注册所有砖块与物件（副作用导入）
import '@/game/registry/skills';   // 注册所有角色技能
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { EditorScene } from './scenes/EditorScene';
import { SCENE, type StartGameData } from './bridge';
import { store } from '@/redux/store';
import type { WorldModel } from '@/type';

/** 画布尺寸 = 一个房间的像素尺寸（每层可以不一样） */
export function roomPx(m: WorldModel): { w: number; h: number } {
  const T = store.getState().config.tile;
  return { w: m.roomW * T, h: m.roomH * T };
}

export type GameMode = 'game' | 'editor';

let current: Phaser.Game | null = null;
export const getGame = (): Phaser.Game | null => current;

export function createGame(parent: HTMLElement, mode: GameMode, data?: StartGameData, size?: { w: number; h: number }): Phaser.Game {
  const cfg = store.getState().config;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: size?.w ?? cfg.viewW,
    height: size?.h ?? cfg.viewH,
    parent,
    backgroundColor: mode === 'editor' ? '#141a2c' : '#0b0b14',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: cfg.gravity }, debug: false } },
    scene: [BootScene, GameScene, EditorScene],
    // 居中交给外层 CSS 的 flex；Phaser 自己再加 margin 会在手机上叠加成偏移
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
  });
  game.registry.set('bootNext', mode === 'editor' ? SCENE.editor : SCENE.game);
  game.registry.set('bootData', data ?? {});
  current = game;
  return game;
}

export function destroyGame(game: Phaser.Game): void {
  if (current === game) current = null;
  game.destroy(true);
}
