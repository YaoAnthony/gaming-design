// ===== 地上的东西（钥匙、蜡烛、帽子、胶带……）：有重力、有碰撞体积 =====
// 碰撞交给一个看不见的物理体（Zone），东西的贴图和身边的光晕、火星每帧跟着它摆（这些由放它的机制建、机制销毁）。
// 一个场景只有一份（ctx.loose），所有机制往里放；场景负责每帧 update / 物理之后 sync，重置由放东西的机制各管各的（reset 给出自己的那几样）：
// - 有重力：脚下的砖被炸掉、被怪物推下平台就往下掉；掉得快的落地弹一下、压扁一下、溅几颗火花
// - 和砖块（木板上站得住）、纸碎块、箱子、移动方块碰撞：站在移动方块 / 纸上就被带着走（solids.ts 登记成 'key' 类）
// - 怪物走过来把它往前推，推到墙上怪物就掉头；玩家不和它碰撞：碰到就捡（各机制自己判断）
// - 停着时轻轻上下浮（帽子这种不浮的可以关）；在空中歪一点，落地摆正
// - 被落下来的碎块埋住、被移动方块挤进来：挪到上面第一格空的地方
// - 被移动方块从下面顶进木板（单向砖）那一格：穿过木板落到板上（上下移动的方块能把东西一层层顶上去给人）
// - 站在移动方块上被带着撞墙：推回墙外，方块从底下走开，东西就掉下去（碎岩横梁当「刮板」，第四层的玩法）
// 参数和纯计算在 looseFall.ts。
import Phaser from 'phaser';
import type { GameConfig, RoomCoord, LooseCheckpoint } from '@/type';
import type { Terrain } from '@/game/terrain/Terrain';
import type { Solids } from './solids';
import type { RoomApi } from './PlayContext';
import { syncDeltas } from './physics';
import { bobOffset, fallTilt, freeCellAbove, LOOSE_BODY, LOOSE_DRAG, LOOSE_LANDING, landingBounce, liftOntoPlank, pushOutX, squashY } from './looseFall';

/** 跟着物理体走的样子 */
export interface LooseView {
  /** 主贴图（图片或一个容器）：底边贴着物理体的底边；落地压扁、停着浮、空中歪都作用在它上面。中心对准自己的中点（origin 0.5） */
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  /** 主贴图本来的缩放（压扁在它上面乘） */
  scale: number;
  /** 画出来多高（没压扁、乘过 scale，像素）：贴图中心 = 物理体底边往上这么一半 */
  height: number;
  /** 跟着东西中心走的（光晕、闪光、暖光） */
  around?: { setPosition(x: number, y: number): unknown }[];
  /** 落地溅的火花颜色 */
  tint: number;
  /** 停着时上下浮（默认浮） */
  bob?: boolean;
}

export interface LooseItem {
  view: LooseView;
  zone: Phaser.GameObjects.Zone;
  body: Phaser.Physics.Arcade.Body;
  /** 碰撞框多大 */
  size: { w: number; h: number };
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

export interface LooseDeps {
  scene: Phaser.Scene;
  cfg: GameConfig;
  terrain: Terrain;
  rooms: RoomApi;
  solids: Solids;
  /** 怪物组（推它） */
  enemies: () => Phaser.Physics.Arcade.Group;
}

/** 停稳程度、歪的角度每帧往目标靠多少 */
const REST_EASE = 0.12, TILT_EASE = 0.25;
/** 压扁时横向胀多少（按变扁的比例） */
const SQUASH_WIDEN = 0.6;

export class LooseItems {
  /** 所有地上东西的物理体（登记为实心体里的 'key' 类：移动方块、纸驮得住它们） */
  readonly group: Phaser.Physics.Arcade.Group;
  private list: LooseItem[] = [];
  /** 落地溅的火花（染成那样东西的颜色） */
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private d: LooseDeps) {
    const { scene, terrain } = d;
    this.group = scene.physics.add.group();
    d.solids.register(this.group, 'key');
    scene.physics.add.collider(this.group, terrain.layer, undefined, terrain.landsOnOneWay);   // 木板：从上面落下来站得住
    this.burst = scene.add.particles(0, 0, 'spark', {
      speedX: { min: -110, max: 110 }, speedY: { min: -130, max: -30 }, gravityY: 500,
      lifespan: { min: 250, max: 450 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: 'ADD', emitting: false,
    }).setDepth(2.45);
  }

  /** 所有机制都建好之后：怪物推它，箱子挡它、托着它（怪物、箱子也有重力，叠在一起要 syncDeltas 才稳） */
  start(): void {
    const { scene, solids } = this.d;
    scene.physics.add.collider(this.d.enemies(), this.group, undefined, this.separateEnemy);
    solids.groups('crate').forEach(g => scene.physics.add.collider(this.group, g, undefined, syncDeltas));
  }

  /** 放一样东西：(x, y) = 贴图停在地上时的中心；贴图的底边就是物理体的底边。size = 碰撞框（默认 LOOSE_BODY） */
  add(view: LooseView, x: number, y: number, size: { w: number; h: number } = LOOSE_BODY): LooseItem {
    const { scene, cfg, rooms } = this.d;
    const home = { x, y: y + view.height / 2 - size.h / 2 };
    const zone = scene.add.zone(home.x, home.y, size.w, size.h);
    this.group.add(zone);   // 组会给它建物理体、套上组的默认设置，自己的设置要在这之后
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true).setDragX(LOOSE_DRAG).setMaxVelocityY(cfg.maxFall);
    const k: LooseItem = { view, zone, body, size, home, homeRoom: rooms.of(home.x, home.y), lastVy: 0, onGround: true, rest: 1, landedAt: -Infinity };
    this.list.push(k);
    this.place(k, scene.time.now);
    return k;
  }

  checkpointItem(k: LooseItem): LooseCheckpoint {
    return { x: k.body.center.x, y: k.body.center.y, vx: k.body.velocity.x, vy: k.body.velocity.y, home: { ...k.home }, onGround: k.onGround };
  }

  restoreItem(k: LooseItem, s: LooseCheckpoint): void {
    k.body.reset(s.x, s.y); k.body.setVelocity(s.vx, s.vy);
    k.home = { ...s.home }; k.homeRoom = this.d.rooms.of(s.home.x, s.home.y);
    k.onGround = s.onGround; k.lastVy = s.vy;
    this.place(k, this.d.scene.time.now);
  }

  /** 被捡走了：物理体拿掉（贴图由放它的机制销毁） */
  remove(k: LooseItem): void {
    this.list = this.list.filter(o => o !== k);
    k.zone.destroy();
  }

  /** 贴图停在地上时的中心（捡的判定、换东西时旧的放在哪） */
  anchor(k: LooseItem): { x: number; y: number } {
    return { x: k.body.center.x, y: k.body.bottom - k.view.height / 2 };
  }

  /** 碰撞框（捡的判定用它：贴图掉下来时会歪、会压扁，外框忽大忽小） */
  rect(k: LooseItem): Phaser.Geom.Rectangle {
    const b = k.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  /** 把它放到 (x, bottom)：碰撞框底边贴着 bottom（人放下东西：贴着脚底），速度清零 */
  dropAt(k: LooseItem, x: number, bottom: number): void {
    k.body.reset(x, bottom - k.size.h / 2);
    this.place(k, this.d.scene.time.now);
  }

  /** 每帧（物理已经走完这一步）：被埋了就挪出来；被顶进木板就落到板上；被移动方块带进墙里就推回去；刚落地就弹一下 */
  update(now: number): void {
    this.list.forEach(k => {
      const b = k.body;
      this.unbury(k);
      this.throughPlank(k);
      this.pushOutOfWalls(k);
      const onGround = b.blocked.down || b.touching.down;
      if (onGround && !k.onGround) this.land(k, now);
      k.onGround = onGround;
      k.lastVy = b.velocity.y;
    });
  }

  /** 物理把位置同步好之后：贴图、光晕摆到物理体上 */
  sync(now: number): void { this.list.forEach(k => this.place(k, now)); }

  /** 重置这几样（放它们的机制给出）：按 R 只管出生在这个房间、或者现在就在这个房间的；死亡 / 下一关全部回去 */
  reset(scope: 'room' | 'world' | 'level', items: LooseItem[]): void {
    const { rooms, scene } = this.d;
    items.forEach(k => {
      const here = rooms.same(k.homeRoom, rooms.current) || rooms.same(rooms.of(k.body.center.x, k.body.center.y), rooms.current);
      if (scope === 'room' && !here) return;
      k.body.reset(k.home.x, k.home.y);   // 速度一起清零
      k.lastVy = 0; k.onGround = true; k.rest = 1; k.landedAt = -Infinity;
      k.view.sprite.setAngle(0);
      this.place(k, scene.time.now);
    });
  }

  // ---------- 内部 ----------
  /** 小物件只被怪物横推，不托起怪物；避免落在钥匙边缘后误判悬崖或撞上低顶。 */
  private separateEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (enemy, zone) => {
    syncDeltas(enemy, zone);
    const eb = (enemy as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    const kb = (zone as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    if (Phaser.Physics.Arcade.SeparateX(eb, kb, false, this.d.scene.physics.world.OVERLAP_BIAS)) this.pushedByEnemy(enemy, zone);
    return false;   // 这对碰撞已经处理完；其它碰撞器仍照常处理物件的竖向落地。
  };

  /** 怪物撞上来：顺着它走的方向、用它的速度推（推着走不会一顿一顿）；这边顶着墙就不推，物理会让怪物掉头 */
  private pushedByEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_enemy, zone) => {
    const b = (zone as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    const dir = b.touching.left ? 1 : b.touching.right ? -1 : 0;
    if (!dir || (dir > 0 ? b.blocked.right : b.blocked.left)) return;
    b.setVelocityX(dir * this.d.cfg.enemySpeed);
  };

  /** 刚落地：落得够快就弹起来、压扁、溅火花 */
  private land(k: LooseItem, now: number): void {
    const up = landingBounce(k.lastVy);
    if (!up) return;
    k.body.setVelocityY(up);
    k.landedAt = now;
    this.burst.setParticleTint(k.view.tint);
    this.burst.explode(LOOSE_LANDING.sparks, k.body.center.x, k.body.bottom - 2);
  }

  /** 物理体中心落在实心砖里：挪到上面第一格空的地方（上面一直到顶都是砖就不管，按 R 回原位） */
  private unbury(k: LooseItem): void {
    const { terrain, cfg } = this.d, T = cfg.tile, b = k.body;
    const solid = (x: number, y: number) => terrain.isSolid(x, y) && !terrain.def(x, y).oneWay;
    const cx = Math.floor(b.center.x / T), cy = Math.floor(b.center.y / T);
    if (!solid(cx, cy)) return;
    const free = freeCellAbove(solid, cx, cy);
    if (free !== null) b.reset(b.center.x, (free + 1) * T - k.size.h / 2);
  }

  /** 被从下面顶进了木板那一格（移动方块往上运、怪物推上去）：穿过木板落到板上。从上面落下来的不算，那本来就站得住 */
  private throughPlank(k: LooseItem): void {
    const { terrain, cfg } = this.d, b = k.body;
    if (b.velocity.y > 0 && !b.touching.down) return;
    const top = liftOntoPlank(b.left, b.right, b.top, b.bottom, cfg.tile, (cx, cy) => terrain.isSolid(cx, cy) && !!terrain.def(cx, cy).oneWay);
    if (top === null) return;
    b.reset(b.center.x, top - k.size.h / 2);
    k.onGround = true;
  }

  /**
   * 站在移动方块上被带着撞上墙：东西自己没有速度，物理引擎不管这种穿透，这里按穿进墙的那一侧推回墙外。
   * 移动方块接着从底下走开，东西走到方块边上就掉下去（路上挂一根横梁就能把它「刮」下来）
   */
  private pushOutOfWalls(k: LooseItem): void {
    const { terrain, cfg } = this.d, b = k.body;
    const x = pushOutX(b.left, b.width, b.top, b.bottom, cfg.tile, (cx, cy) => terrain.isSolid(cx, cy) && !terrain.def(cx, cy).oneWay);
    if (x !== null) { b.x = x; b.updateCenter(); }
  }

  private place(k: LooseItem, now: number): void {
    const { view, body: b } = k;
    const still = k.onGround && Math.abs(b.velocity.x) < 1 && Math.abs(b.velocity.y) < 1;
    k.rest += ((still ? 1 : 0) - k.rest) * REST_EASE;
    const sy = squashY(now - k.landedAt), sx = 1 + (1 - sy) * SQUASH_WIDEN;
    const h = view.height, x = b.center.x;
    // 压扁时底边不动；停着时整体浮起来一点
    const bob = view.bob === false ? 0 : bobOffset(now, k.rest);
    view.sprite.setPosition(x, b.bottom - (h * sy) / 2 + bob)
      .setScale(view.scale * sx, view.scale * sy)
      .setAngle(view.sprite.angle + (fallTilt(b.velocity.y, k.onGround) - view.sprite.angle) * TILT_EASE);
    view.around?.forEach(o => o.setPosition(x, b.bottom - h / 2));
  }
}
