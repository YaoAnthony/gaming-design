// ===== 复活动画：Game Master 的木手捏着主角的后领从房间外伸进来，放到复活点，松手，缩回去 =====
// 手本身画在界面那一层（ui/story/GameHandOverlay → stage3d/hand 的 3D 模型）：这里只管时间线，每帧把捏合点在画面上的位置（比例坐标）、
// 姿势、从哪边伸进来发 EVT.gameHand。主角播 hang（被拎着）动画，贴在捏合点下面跟着走（hang 帧里的捏合点 HERO.hangPinch 在精灵中心上面
// hangOffsetY 像素）；拎着的时候主角也交给那一层画（held：当前这一帧的贴图范围），夹在拇指尖和食指尖之间，不然会被手挡住；
// 松手那一刻才在游戏里重新显示。手后面的紫光、光雾和落地的火花还在游戏里画（在手下面）。时长在 config.respawnHandMs。
// 手从离复活点远的那一侧的上方斜伸进来：复活点在房间左半边就从左上角，在右半边就从右上角；主角背对手来的那一侧。
import Phaser from 'phaser';
import type { Point } from '@/type';
import type { Player } from '@/sprite';
import { RESPAWN_HAND } from '@/asset';
import { bridge, EVT, type GameHand, type HandPose, type HeldSprite, type ScreenSpot } from '@/protocol';

/** 各阶段占总时长的比例：伸进来 / 放下去 / 停一下再松手 / 缩回去 */
const PHASE = { reach: 0.42, lower: 0.18, hold: 0.1, retract: 0.3 };
/** 从多远伸进来（格）：起点在复活点斜上方这么远 */
const REACH = { x: 5, y: 5.5 };
/** 放下之前先停在复活点上方多高（格） */
const HOVER = 0.8;
/** 手臂往画面上方那个角斜过去多少度（0 = 竖直从正上方下来）；伸进来时手先歪这么多度再摆正 */
const LEAN = 35, SWING = 10;
/** 缩回去：捏合点收到画面上边缘外多远（格），整只手就都出了画面 */
const EXIT = 1.5;

export interface RespawnHandOptions {
  tile: number;
  durationMs: number;
  /** 复活点所在房间的左右边界（像素）：决定手从哪一侧伸进来 */
  roomLeft: number;
  roomRight: number;
  /** 手多长（格）：config.gmHand.carryTiles */
  handTiles: number;
}

/**
 * 捏着 player 放到 target（玩家身体中心）。全程玩家冻住、跟着手走；松手的那一刻调 onRelease（由场景把玩家真正放回复活点、恢复控制）。
 * 动画用的东西都挂在场景上，场景关闭时一起销毁（手也一起收掉）
 */
export function playRespawnHand(scene: Phaser.Scene, player: Player, target: Point, opts: RespawnHandOptions, onRelease: () => void): void {
  const T = opts.tile, D = opts.durationMs, cam = scene.cameras.main;
  const mirror = target.x > (opts.roomLeft + opts.roomRight) / 2;   // 右半边：从右上角来
  const side = mirror ? 1 : -1;
  // 捏的是后领：捏合点落到 target 上面 lift 处，松手时人正好在 target
  player.playAction('hang', { loop: true });
  const lift = player.hangOffsetY;
  const start = { x: target.x + side * REACH.x * T, y: target.y - lift - REACH.y * T };
  const hover = { x: target.x, y: target.y - lift - HOVER * T };
  const exit = { x: start.x, y: cam.scrollY - EXIT * T };
  /** 捏合点在世界里的位置、手再多歪几度（时间线 tween 的就是它） */
  const hand = { x: start.x, y: start.y, angle: -side * SWING };

  const spot = (x: number, y: number): ScreenSpot => ({ x: (x - cam.scrollX) / cam.width, y: (y - cam.scrollY) / cam.height });
  /** 主角现在这一帧（拎着的时候交给手那一层画） */
  const held = (): HeldSprite => {
    const f = player.frame;
    return {
      texture: player.texture.key, frame: { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight },
      at: spot(player.x, player.y), w: player.displayWidth / cam.width, h: player.displayHeight / cam.height, flipX: player.flipX,
    };
  };
  const show = (pose: HandPose) => {
    const h: GameHand = {
      spot: spot(hand.x, hand.y), pose, anchor: 'pinch', from: 'top', tilt: side * LEAN + hand.angle, ms: 0,
      length: opts.handTiles * T / cam.height, held: player.visible ? null : held(),
    };
    bridge.emit(EVT.gameHand, h);
  };
  const hide = () => bridge.emit(EVT.gameHand, { spot: null, pose: 'open', ms: 0 });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, hide);

  const scale = T / 32;
  // 手心后面一团紫光，跟着手走。放在玩家下面（玩家深度 10），不然加亮混合会把玩家照白
  const glow = scene.add.image(start.x, start.y, 'fogglow').setTint(RESPAWN_HAND.glow[0]).setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.55).setScale(2.4 * scale).setDepth(9.5);
  // 光雾：手周围不停冒紫色的烟点
  const mist = scene.add.particles(start.x, start.y, 'spark', {
    tint: RESPAWN_HAND.glow, blendMode: 'ADD', lifespan: 650, frequency: 22, quantity: 2,
    speed: { min: 8, max: 36 }, scale: { start: 1.6, end: 0 }, alpha: { start: 0.85, end: 0 },
    emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 1.6 * T), quantity: 1 } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
  }).setDepth(10.5);

  // 玩家冻住，贴在捏合点下面跟着走；拎着的时候藏起来，由手那一层画
  player.freeze(0xffffff); player.clearTint();
  player.setFlipX(mirror);   // 背对手伸过来的那一侧，像被拎着
  player.setVisible(false);
  let pose: HandPose = 'grip';
  const carry = () => {
    player.setPosition(hand.x, hand.y + lift);
    player.body.reset(hand.x, hand.y + lift);
    glow.setPosition(hand.x, hand.y);
    mist.setPosition(hand.x + side * 0.4 * T, hand.y - 0.6 * T);   // 中心往手臂那边偏一点
    show(pose);
  };
  carry();

  const release = () => {
    pose = 'open';
    player.setVisible(true);
    show(pose);
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
      targets: hand, x: exit.x, y: exit.y, duration: D * PHASE.retract, ease: 'Cubic.in',
      onUpdate: () => { glow.setPosition(hand.x, hand.y).setAlpha(0.55 * Math.max(0, 1 - (start.y - hand.y) / (start.y - exit.y))); show(pose); },
      onComplete: () => {
        scene.events.off(Phaser.Scenes.Events.SHUTDOWN, hide);
        hide();
        glow.destroy();
        scene.time.delayedCall(1000, () => mist.destroy());
      },
    });
  };

  scene.tweens.chain({
    tweens: [
      // 伸进来：先快后慢，带一点转动
      { targets: hand, x: hover.x, y: hover.y, angle: 0, duration: D * PHASE.reach, ease: 'Cubic.out', onUpdate: carry },
      // 放下去，停一下再松手
      { targets: hand, y: target.y - lift, duration: D * PHASE.lower, ease: 'Sine.inOut', completeDelay: D * PHASE.hold, onUpdate: carry, onComplete: () => { release(); retract(); } },
    ],
  });
}
