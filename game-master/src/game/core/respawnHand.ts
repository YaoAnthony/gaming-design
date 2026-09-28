// ===== 复活动画：骷髅手捏着玩家从房间外伸进来，放到复活点，松手，缩回去 =====
// 贴图和捏合点在 asset 的 RESPAWN_HAND；时长在 config.respawnHandMs。
// 手从离复活点远的那一侧进场：复活点在房间左半边就从左上角伸进来，在右半边就从右上角（贴图左右翻转）。
import Phaser from 'phaser';
import type { Point } from '@/type';
import type { Player } from '@/sprite';
import { RESPAWN_HAND, TILE_SIZE } from '@/asset';

/** 各阶段占总时长的比例：伸进来 / 放下去 / 停一下再松手 / 缩回去 */
const PHASE = { reach: 0.42, lower: 0.18, hold: 0.1, retract: 0.3 };
/** 从多远伸进来（格）：起点在复活点斜上方这么远 */
const REACH = { x: 5, y: 5.5 };
/** 放下之前先停在复活点上方多高（格） */
const HOVER = 0.8;
/** 手臂末端的烟雾放在贴图角上往里收这么多像素（贴图原始像素）的地方 */
const ARM_END_INSET = 14;

export interface RespawnHandOptions {
  tile: number;
  durationMs: number;
  /** 复活点所在房间的左右边界（像素）：决定手从哪一侧伸进来 */
  roomLeft: number;
  roomRight: number;
}

/**
 * 捏着 player 放到 target（玩家身体中心）。全程玩家冻住、跟着手走；松手的那一刻调 onRelease（由场景把玩家真正放回复活点、恢复控制）。
 * 动画用的东西都挂在场景上，场景关闭时一起销毁
 */
export function playRespawnHand(scene: Phaser.Scene, player: Player, target: Point, opts: RespawnHandOptions, onRelease: () => void): void {
  const T = opts.tile, D = opts.durationMs;
  const mirror = target.x > (opts.roomLeft + opts.roomRight) / 2;   // 右半边：从右上角来
  const side = mirror ? 1 : -1;
  const start = { x: target.x + side * REACH.x * T, y: target.y - REACH.y * T };
  const hover = { x: target.x, y: target.y - HOVER * T };
  const [px, py] = RESPAWN_HAND.pinch;

  const hand = scene.add.image(start.x, start.y, RESPAWN_HAND.hold)
    .setOrigin(mirror ? 1 - px : px, py).setFlipX(mirror).setScale(T / TILE_SIZE).setDepth(10.6);
  const scale = T / TILE_SIZE;
  // 手心后面一团紫光，跟着手走。放在玩家下面（玩家深度 10），不然加亮混合会把玩家照白
  const glow = scene.add.image(start.x, start.y, 'fogglow').setTint(RESPAWN_HAND.glow[0]).setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.55).setScale(2.4 * scale).setDepth(9.5);
  // 手臂从一团紫色烟雾（裂隙）里伸出来：烟雾跟着贴图的手臂末端（贴图左上角，翻转时是右上角）走，盖住手臂的断口
  const armEnd = {
    x: side * (px * hand.width - ARM_END_INSET) * scale,
    y: -(py * hand.height - ARM_END_INSET) * scale,
  };
  const riftGlow = scene.add.image(start.x, start.y, 'fogglow').setTint(RESPAWN_HAND.glow[2]).setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.8).setScale(2 * scale).setDepth(10.55);
  const rift = scene.add.particles(0, 0, 'spark', {
    tint: RESPAWN_HAND.smoke, lifespan: 900, frequency: 14, quantity: 3,
    speed: { min: 4, max: 22 }, scale: { start: 3.2, end: 0.6 }, alpha: { start: 0.95, end: 0 },
    emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 0.9 * T), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
  }).setDepth(10.7);
  rift.startFollow(hand, armEnd.x, armEnd.y);
  // 光雾：手和手臂周围不停冒紫色的烟点
  const mist = scene.add.particles(0, 0, 'spark', {
    tint: RESPAWN_HAND.glow, blendMode: 'ADD', lifespan: 650, frequency: 22, quantity: 2,
    speed: { min: 8, max: 36 }, scale: { start: 1.6, end: 0 }, alpha: { start: 0.85, end: 0 },
    emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 1.6 * T), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
  }).setDepth(10.5);
  mist.startFollow(hand, side * 0.8 * T, -0.8 * T);   // 中心往手臂那边偏一点，手臂上也有雾

  // 玩家冻住，贴在手的捏合点上跟着走
  player.freeze(0xffffff); player.clearTint();
  player.setFlipX(mirror);   // 背对手伸过来的那一侧，像被拎着
  const carry = () => {
    player.setPosition(hand.x, hand.y);
    player.body.reset(hand.x, hand.y);
    glow.setPosition(hand.x, hand.y);
    riftGlow.setPosition(hand.x + armEnd.x, hand.y + armEnd.y);
  };
  carry();

  const release = () => {
    hand.setTexture(RESPAWN_HAND.open);
    const feet = target.y + player.displayHeight / 2;
    const burst = scene.add.particles(target.x, feet, 'spark', {
      tint: RESPAWN_HAND.glow, blendMode: 'ADD', lifespan: 520, emitting: false,
      speed: { min: 50, max: 150 }, angle: { min: 195, max: 345 }, scale: { start: 1.8, end: 0 }, alpha: { start: 1, end: 0 },
    }).setDepth(10.5);
    burst.explode(26);
    scene.time.delayedCall(600, () => burst.destroy());
    onRelease();
  };

  const retract = () => {
    mist.stop();
    scene.tweens.add({
      targets: hand, x: start.x, y: start.y, alpha: 0, duration: D * PHASE.retract, ease: 'Cubic.in',
      onUpdate: () => { glow.setPosition(hand.x, hand.y).setAlpha(0.55 * hand.alpha); riftGlow.setPosition(hand.x + armEnd.x, hand.y + armEnd.y).setAlpha(0.8 * hand.alpha); },
      onComplete: () => {
        rift.stop();
        hand.destroy(); glow.destroy(); riftGlow.destroy();
        scene.time.delayedCall(1000, () => { mist.destroy(); rift.destroy(); });
      },
    });
  };

  scene.tweens.chain({
    tweens: [
      // 伸进来：先快后慢，带一点转动
      { targets: hand, x: hover.x, y: hover.y, angle: { from: -side * 10, to: 0 }, duration: D * PHASE.reach, ease: 'Cubic.out', onUpdate: carry },
      // 放下去，停一下再松手
      { targets: hand, y: target.y, duration: D * PHASE.lower, ease: 'Sine.inOut', completeDelay: D * PHASE.hold, onUpdate: carry, onComplete: () => { release(); retract(); } },
    ],
  });
}
