// ===== 地上的钥匙：有重力、有碰撞体积，会被怪物推着走 =====
// 碰撞交给一个看不见的物理体（Zone），钥匙贴图、背后的光晕、闪光每帧跟着它摆（这些由 Carry 建、Carry 销毁）：
// - 有重力：脚下的砖被炸掉、被怪物推下平台就往下掉；掉得快的落地弹一下、压扁一下、溅几颗同色的火花
// - 和砖块（木板上站得住）、纸碎块、箱子、移动方块碰撞；怪物走过来把它往前推，推到墙上怪物就掉头
// - 玩家不和它碰撞：碰到就捡（Carry 管）
// - 碰到同色的门：门开、钥匙用掉（Locks.ts，和拿在手上的钥匙是同一段判断）
// - 停着时轻轻上下浮（和以前一样）；在空中歪一点，落地摆正
// - 被落下来的碎块埋住、被移动方块挤进来：挪到上面第一格空的地方
// - 站在移动方块上被带着撞墙：推回墙外，方块从底下走开，钥匙就掉下去（碎岩横梁当「刮板」，第四层的玩法）
// - 按 R：出生（或被放下）在这个房间、或者现在就在这个房间的钥匙回到原位；死亡重置整张图时全部回去
// 参数和纯计算在 keyFall.ts。
import Phaser from 'phaser';
import type { RoomCoord } from '@/type';
import type { PlayContext } from '@/game/core/PlayContext';
import { syncDeltas } from '@/game/core/physics';
import { bobOffset, fallTilt, freeCellAbove, KEY_BODY, KEY_DRAG, KEY_LANDING, landingBounce, pushOutX, squashY } from './keyFall';

/** 跟着物理体走的东西 */
export interface KeyView {
  sprite: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  glints: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 钥匙的颜色：落地溅的火花用 */
  tint: number;
  /** 贴图的缩放（地上的钥匙画大一号） */
  scale: number;
}

export interface LooseKey {
  view: KeyView;
  zone: Phaser.GameObjects.Zone;
  body: Phaser.Physics.Arcade.Body;
  /** 出生 / 被放下时物理体的中心和所在房间：重置回到这里 */
  home: { x: number; y: number };
  homeRoom: RoomCoord;
  /** 上一帧的下落速度：落地那一帧物理已经把速度清零了，弹多高要看落地前的 */
  lastVy: number;
  onGround: boolean;
  /** 停稳的程度 0..1：停稳了才浮 */
  rest: number;
  /** 最近一次落地压扁的时刻（场景时间，毫秒） */
  landedAt: number;
}

/** 停稳程度、歪的角度每帧往目标靠多少 */
const REST_EASE = 0.12, TILT_EASE = 0.25;
/** 压扁时横向胀多少（按变扁的比例） */
const SQUASH_WIDEN = 0.6;

export class LooseKeys {
  /** 所有地上钥匙的物理体（登记为实心体里的钥匙：移动方块、纸驮得住它们） */
  readonly group: Phaser.Physics.Arcade.Group;
  private list: LooseKey[] = [];
  /** 落地溅的火花（染成那把钥匙的颜色） */
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private ctx: PlayContext) {
    const { scene, terrain } = ctx;
    this.group = scene.physics.add.group();
    ctx.solids.register(this.group, 'key');
    scene.physics.add.collider(this.group, terrain.layer, undefined, terrain.landsOnOneWay);   // 木板：从上面落下来站得住
    this.burst = scene.add.particles(0, 0, 'spark', {
      speedX: { min: -110, max: 110 }, speedY: { min: -130, max: -30 }, gravityY: 500,
      lifespan: { min: 250, max: 450 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: 'ADD', emitting: false,
    }).setDepth(2.45);
  }

  /** 所有机制都建好之后：怪物推它，箱子挡它、托着它（怪物、箱子也有重力，叠在一起要 syncDeltas 才稳） */
  start(): void {
    const { scene, enemies } = this.ctx;
    scene.physics.add.collider(enemies.group, this.group, this.pushedByEnemy, syncDeltas);
    this.ctx.solids.groups('crate').forEach(g => scene.physics.add.collider(this.group, g, undefined, syncDeltas));
  }

  /** 放一把钥匙：(x, y) = 钥匙贴图停在地上时的中心；贴图的底边就是物理体的底边 */
  add(view: KeyView, x: number, y: number): LooseKey {
    const { scene, cfg, rooms } = this.ctx;
    const home = { x, y: y + this.fullHeight(view) / 2 - KEY_BODY.h / 2 };
    const zone = scene.add.zone(home.x, home.y, KEY_BODY.w, KEY_BODY.h);
    this.group.add(zone);   // 组会给它建物理体、套上组的默认设置，自己的设置要在这之后
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true).setDragX(KEY_DRAG).setMaxVelocityY(cfg.maxFall);
    const k: LooseKey = { view, zone, body, home, homeRoom: rooms.of(home.x, home.y), lastVy: 0, onGround: true, rest: 1, landedAt: -Infinity };
    this.list.push(k);
    this.place(k, scene.time.now);
    return k;
  }

  /** 被捡走了：物理体拿掉（贴图由 Carry 销毁） */
  remove(k: LooseKey): void {
    this.list = this.list.filter(o => o !== k);
    k.zone.destroy();
  }

  /** 钥匙贴图停在地上时的中心（捡的判定、换东西时旧的放在哪） */
  anchor(k: LooseKey): { x: number; y: number } {
    return { x: k.body.center.x, y: k.body.bottom - this.fullHeight(k.view) / 2 };
  }

  /** 每帧（物理已经走完这一步）：被埋了就挪出来；被移动方块带进墙里就推回去；刚落地就弹一下 */
  update(now: number): void {
    this.list.forEach(k => {
      const b = k.body;
      this.unbury(k);
      this.pushOutOfWalls(k);
      const onGround = b.blocked.down || b.touching.down;
      if (onGround && !k.onGround) this.land(k, now);
      k.onGround = onGround;
      k.lastVy = b.velocity.y;
    });
  }

  /** 物理把位置同步好之后：贴图、光晕、闪光摆到物理体上 */
  sync(now: number): void { this.list.forEach(k => this.place(k, now)); }

  /** 重置：按 R 只管出生在这个房间、或者现在就在这个房间的；死亡 / 下一关全部回去 */
  reset(scope: 'room' | 'world' | 'level'): void {
    const { rooms, scene } = this.ctx;
    this.list.forEach(k => {
      const here = rooms.same(k.homeRoom, rooms.current) || rooms.same(rooms.of(k.body.center.x, k.body.center.y), rooms.current);
      if (scope === 'room' && !here) return;
      k.body.reset(k.home.x, k.home.y);   // 速度一起清零
      k.lastVy = 0; k.onGround = true; k.rest = 1; k.landedAt = -Infinity;
      k.view.sprite.setAngle(0);
      this.place(k, scene.time.now);
    });
  }

  // ---------- 内部 ----------
  /** 怪物撞上来：顺着它走的方向、用它的速度推（推着走不会一顿一顿）；这边顶着墙就不推，物理会让怪物掉头 */
  private pushedByEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_enemy, zone) => {
    const b = (zone as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    const dir = b.touching.left ? 1 : b.touching.right ? -1 : 0;
    if (!dir || (dir > 0 ? b.blocked.right : b.blocked.left)) return;
    b.setVelocityX(dir * this.ctx.cfg.enemySpeed);
  };

  /** 刚落地：落得够快就弹起来、压扁、溅火花 */
  private land(k: LooseKey, now: number): void {
    const up = landingBounce(k.lastVy);
    if (!up) return;
    k.body.setVelocityY(up);
    k.landedAt = now;
    this.burst.setParticleTint(k.view.tint);
    this.burst.explode(KEY_LANDING.sparks, k.body.center.x, k.body.bottom - 2);
  }

  /** 物理体中心落在实心砖里：挪到上面第一格空的地方（上面一直到顶都是砖就不管，按 R 回原位） */
  private unbury(k: LooseKey): void {
    const { terrain, cfg } = this.ctx, T = cfg.tile, b = k.body;
    const solid = (x: number, y: number) => terrain.isSolid(x, y) && !terrain.def(x, y).oneWay;
    const cx = Math.floor(b.center.x / T), cy = Math.floor(b.center.y / T);
    if (!solid(cx, cy)) return;
    const free = freeCellAbove(solid, cx, cy);
    if (free !== null) b.reset(b.center.x, (free + 1) * T - KEY_BODY.h / 2);
  }

  /**
   * 站在移动方块上被带着撞上墙：钥匙自己没有速度，物理引擎不管这种穿透，这里按穿进墙的那一侧推回墙外。
   * 移动方块接着从底下走开，钥匙走到方块边上就掉下去（路上挂一根横梁就能把钥匙「刮」下来）
   */
  private pushOutOfWalls(k: LooseKey): void {
    const { terrain, cfg } = this.ctx, b = k.body;
    const x = pushOutX(b.left, b.width, b.top, b.bottom, cfg.tile, (cx, cy) => terrain.isSolid(cx, cy) && !terrain.def(cx, cy).oneWay);
    if (x !== null) { b.x = x; b.updateCenter(); }
  }

  /** 钥匙贴图画出来多高（没压扁时） */
  private fullHeight(view: KeyView): number { return view.sprite.height * view.scale; }

  private place(k: LooseKey, now: number): void {
    const { view, body: b } = k;
    const still = k.onGround && Math.abs(b.velocity.x) < 1 && Math.abs(b.velocity.y) < 1;
    k.rest += ((still ? 1 : 0) - k.rest) * REST_EASE;
    const sy = squashY(now - k.landedAt), sx = 1 + (1 - sy) * SQUASH_WIDEN;
    const h = this.fullHeight(view), x = b.center.x;
    // 压扁时底边不动；停着时整体浮起来一点
    view.sprite.setPosition(x, b.bottom - (h * sy) / 2 + bobOffset(now, k.rest))
      .setScale(view.scale * sx, view.scale * sy)
      .setAngle(view.sprite.angle + (fallTilt(b.velocity.y, k.onGround) - view.sprite.angle) * TILT_EASE);
    view.halo.setPosition(x, b.bottom - h / 2);
    view.glints.setPosition(x, b.bottom - h / 2);
  }
}
