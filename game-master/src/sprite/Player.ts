// ===== 玩家：移动、滑墙、蹬墙跳、土狼时间、跳跃缓冲 =====
// 起跳后返回 JumpEvent（起跳类型 + 爆炸中心格），爆炸本身由场景处理。
import Phaser from 'phaser';
import type { CellRef, EntryState, GameConfig } from '@/type';
import { DEPTH } from '@/game/depth';

/**
 * 主角动画：Aseprite 导出的 sprite sheet（源文件在仓库根目录 Aseprite asset/，BootScene 里 load.aseprite）。
 * 每帧 40x40，脚底贴最下面一行、身体中线在正中；站着时人高 artH、宽 artW 像素（帧四周是给跑跳留的空）。
 * 动画名就是 Aseprite 里的标签。没加载到（比如单测）就退回下面的方块贴图
 */
export const HERO = { key: 'hero', artH: 30, artW: 21, hangPinch: { x: 20, y: 16 } } as const;   // hangPinch：hang 帧里后背捏合点的像素
/** 循环播的动画；跳跃的三段（上升 / 最高点 / 下落）播一遍停在最后一帧 */
const LOOPING = new Set(['idle', 'run']);
/** 空中竖直速度在 ±这么多（px/s）以内算最高点 */
const APEX_SPEED = 120;

/** 三个阶段的身体贴图：第 1 关 1 格高、第 2 关 1.5 格高、第 3 关 2 格高（没注册的就拿现有的拉高；用动画主角时都是拉高） */
const STAGE_TEXTURES = ['player', 'player_mid', 'player_tall'];
/** 每长大一阶多高（格） */
export const STAGE_EXTRA = 0.5;
/** 最高长到第几阶 */
export const MAX_STAGE = STAGE_TEXTURES.length - 1;

/**
 * 跳跃的挤压拉伸（纯视觉，不影响碰撞）：起跳一下拉长、空中按竖直速度拉长、落地按落地速度压扁，
 * 再由一个欠阻尼弹簧弹回原形（会回弹过头一点，所以看着有弹性）。量都是「高度多出的比例」，宽度反向变 widthRatio 倍
 */
const SQUASH = {
  /** 地面起跳 / 蹬墙跳那一下拉长多少 */
  jump: 0.3, wallJump: 0.22,
  /** 落地压扁最多多少；落地速度达到 landSpeed（px/s）时压满，太轻（< landMin 比例）不压 */
  land: 0.32, landSpeed: 800, landMin: 0.15,
  /** 空中最多拉长多少；竖直速度达到 airSpeed（px/s）时拉满 */
  airMax: 0.12, airSpeed: 900,
  /** 宽度跟着反向变的比例（体积守恒是 0.5 左右，大一点更夸张） */
  widthRatio: 0.7,
  /** 弹簧：刚度和阻尼（阻尼比 ≈ damping / (2·√stiffness) ≈ 0.45，会回弹一次） */
  stiffness: 520, damping: 20,
};

export interface PlayerInput { left: boolean; right: boolean }
export interface JumpEvent { kind: 'ground' | 'wall'; cell: CellRef; /** 蹬墙跳时墙在哪一侧 */ side?: 1 | -1; /** 起跳时按着的方向 */ dir?: -1 | 0 | 1 }

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private lastGroundedAt = -9999;
  private jumpPressedAt = -9999;
  private inputLockUntil = 0;
  private lastGroundCell: CellRef | null = null;
  /** 头上额外的高度（格），戴帽子时是 hatHeight */
  private extra = 0;
  /** 长大阶段：0 = 第 1 关 1 格高，1 = 第 2 关 1.5 格，2 = 第 3 关 2 格 */
  private _stage = 0;
  /** 现在比本来多高（格）：平时 = stage * STAGE_EXTRA，长大动画中是中间值（贴图和碰撞框一起变高） */
  private growth = 0;
  /** 挤压拉伸：当前的量（+ 拉长 / − 压扁）和它的速度；上一帧的状态用来判断落地 */
  private squash = 0;
  private squashVel = 0;
  private wasGrounded = true;
  private airVy = 0;
  /** 这一帧套上的变形：真实缩放、套上后的缩放、往上挪了多少、挪完的 y（null = 没套） */
  private unsquashed: { sx: number; sy: number; qx: number; qy: number; dy: number; qyPos: number } | null = null;
  /** 正在播的指定动作（见 playAction）：播着的时候 animate 不换动画 */
  private action: { key: string; interruptible: boolean } | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, private cfg: GameConfig) {
    super(scene, x, y, scene.textures.exists(HERO.key) ? HERO.key : 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.player);
    // 动画建在这个精灵自己身上（不进全局），场景重开不会撞名
    if (this.hero) { scene.anims.createFromAseprite(HERO.key, undefined, this); this.play({ key: 'idle', repeat: -1 }); }
    this.applyShape();
    this.body.setMaxVelocityY(cfg.maxFall);
    // Arcade 会把精灵的缩放同步成碰撞框大小，所以变形只在物理跑完后套上、下一帧物理前还原。
    // 挂在 POST_UPDATE 上：比各机制 start() 里挂的晚创建的监听先跑，帽子之类的跟随物读到的就是变形后的样子
    const ev = scene.events;
    ev.on(Phaser.Scenes.Events.PRE_UPDATE, this.unsquash, this);
    ev.on(Phaser.Scenes.Events.POST_UPDATE, this.applySquash, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      ev.off(Phaser.Scenes.Events.PRE_UPDATE, this.unsquash, this);
      ev.off(Phaser.Scenes.Events.POST_UPDATE, this.applySquash, this);
    });
  }

  setConfig(cfg: GameConfig): void { this.cfg = cfg; }

  /** 用的是不是动画主角（不是就是旧的方块贴图） */
  get hero(): boolean { return this.texture.key === HERO.key; }

  /** 这个人长什么样的静态图（资源清单 IMAGES 的 key，和现在的贴图一样大）：剧情演出、3D 世界拿去画 */
  get portraitKey(): string { return this.hero ? 'player' : this.texture.key; }

  /** 头顶在哪（世界 y）：当前这一帧最上面一行不透明像素，跟着动画和挤压拉伸走。帽子戴在这里 */
  get headTop(): number { return this.y - this.displayHeight / 2 + topRow(this) * this.scaleY; }
  /** 贴图里人有多宽（像素）：动画帧四周有留白，按人本身算 */
  get artWidth(): number { return this.hero ? HERO.artW * Math.abs(this.scaleX) : this.displayWidth; }

  /** 现在的身高（格）：本身 + 长大的 + 头上戴的 */
  get heightTiles(): number { return this.cfg.playerHeight + this.growth + this.extra; }
  /** 长大阶段（0 / 1 / 2） */
  get stage(): number { return this._stage; }

  /** 直接设成某一阶（进场恢复用）：贴图和碰撞框立刻换成那一阶的 */
  setStage(n: number): void {
    this._stage = Phaser.Math.Clamp(Math.round(n), 0, MAX_STAGE);
    this.setGrowth(this._stage * STAGE_EXTRA);
  }

  /** 碰撞框往上加高 tiles 格（戴帽子）或恢复（0）。脚底位置不变，贴图不变（帽子另画） */
  setExtraHeight(tiles: number): void {
    this.extra = tiles;
    this.applyShape();
  }

  /**
   * 比本来多高 extraTiles 格（长大动画每帧调；到整阶时换成那一阶的贴图，中间用当前贴图拉高）。
   * 贴图和碰撞框一起变高，脚底不动（身体中心会往上挪）。
   * 只在人不动的时候调用（刚建好、或 freeze 之后播动画）：这里直接改精灵位置再 reset 物理体，动着改会和物理同步打架
   */
  setGrowth(extraTiles: number): void {
    const feet = this.body.bottom;
    this.growth = Phaser.Math.Clamp(extraTiles, 0, MAX_STAGE * STAGE_EXTRA);
    // 已经长到的整阶用它的贴图（没注册的往下找有的）；动画主角一直用同一套动画，拉高
    if (!this.hero) for (let s = Math.floor(this.growth / STAGE_EXTRA + 1e-6); s >= 0; s--) {
      const key = STAGE_TEXTURES[s];
      if (!this.scene.textures.exists(key)) continue;
      if (this.texture.key !== key) this.setTexture(key);
      break;
    }
    this.applyShape();
    this.body.updateFromGameObject();
    this.body.reset(this.x, this.y + (feet - this.body.bottom));
  }

  /**
   * 贴图缩放到 playerWidth × (playerHeight + 长大) 格；碰撞框：宽 playerHitboxWidth（居中、比贴图窄），
   * 高再加帽子的 extra，底边贴着贴图底边。碰撞框按贴图原始像素设，Arcade 会跟着精灵的缩放一起缩
   */
  private applyShape(): void {
    const c = this.cfg, T = c.tile, fw = this.width, fh = this.height;
    const visible = c.playerHeight + this.growth;                       // 画出来的高度（格）
    if (this.hero) {
      // 动画帧四周有留白：按“人”的高度缩放（playerHeight 格 = artH 像素，长高只往上拉，不变宽），
      // 碰撞框也按人算：宽 playerHitboxWidth、高 = 身高 + 帽子，居中、底边贴帧底（脚底）
      const sx = c.playerHeight * T / HERO.artH, sy = visible * T / HERO.artH;
      this.setScale(sx, sy);
      const hw = c.playerHitboxWidth * T / sx, hh = (visible + this.extra) * T / sy;
      this.body.setSize(hw, hh, false);
      this.body.setOffset((fw - hw) / 2, fh - hh);
      return;
    }
    this.setScale(c.playerWidth * T / fw, visible * T / fh);
    const k = (visible + this.extra) / visible;                          // 帽子：碰撞框再往上长
    const hw = fw * Math.min(1, c.playerHitboxWidth / c.playerWidth);   // 碰撞框宽（贴图原始像素）
    this.body.setSize(hw, fh * k, false);
    this.body.setOffset((fw - hw) / 2, fh - fh * k);                     // 左右居中；往上长：偏移是负的，底边还在贴图底边
  }
  pressJump(now: number): void { this.jumpPressedAt = now; }

  /** 切到俯视（吃豆人）：不受重力，碰撞框改成居中的方块，人稍微缩一点好在一格宽的走廊里转弯 */
  enterTopDown(): void {
    this.body.setAllowGravity(false);
    if (!this.hero) { this.setScale(0.8); this.body.setSize(25, 25, true); return; }
    // 人缩到 0.8 格高；碰撞框 0.625 格见方（和方块贴图 25px × 0.8 一样大），套在人身上（人在帧的下半截）
    const T = this.cfg.tile, s = 0.8 * T / HERO.artH, side = 0.625 * T / s;
    this.setScale(s);
    this.body.setSize(side, side, false);
    this.body.setOffset((this.width - side) / 2, this.height - HERO.artH / 2 - side / 2);
  }

  get onGround(): boolean { return this.body.blocked.down; }
  get onWallLeft(): boolean { return !this.onGround && this.body.blocked.left; }
  get onWallRight(): boolean { return !this.onGround && this.body.blocked.right; }

  /** 脚下那一格（地面起跳的爆炸中心） */
  groundCell(): CellRef {
    const b = this.body, T = this.cfg.tile;
    return { x: Math.floor(b.center.x / T), y: Math.floor((b.bottom + 1) / T) };
  }
  /** 身侧那一格（蹬墙跳的爆炸中心） */
  wallCell(side: 1 | -1): CellRef {
    const b = this.body, T = this.cfg.tile;
    const x = side > 0 ? Math.floor((b.right + 1) / T) : Math.floor((b.left - 1) / T);
    return { x, y: Math.floor(b.center.y / T) };
  }
  /** 当前如果起跳会是什么样的起跳（用于预览） */
  previewJump(input?: PlayerInput): JumpEvent | null {
    if (this.onGround) return { kind: 'ground', cell: this.groundCell(), dir: input?.left ? -1 : input?.right ? 1 : 0 };
    if (this.onWallRight) return { kind: 'wall', cell: this.wallCell(1), side: 1 };
    if (this.onWallLeft) return { kind: 'wall', cell: this.wallCell(-1), side: -1 };
    return null;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.animate();
  }

  /**
   * 播一段指定的动作（hang 被拎着、getup 爬起来），播的时候不按身体状态换动画。
   * loop = 一直循环到 stopAction；不循环的播完自己结束。interruptible = 按方向键或跳就打断（step 里判断）
   */
  playAction(key: string, opts: { loop?: boolean; interruptible?: boolean } = {}): void {
    if (!this.hero) return;
    const action = { key, interruptible: !!opts.interruptible };
    this.action = action;
    this.play({ key, repeat: opts.loop ? -1 : 0 });
    if (!opts.loop) this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + key, () => { if (this.action === action) this.action = null; });
  }

  stopAction(): void { this.action = null; }

  /** 被捏着后背拎起来时，精灵中心在捏合点下面多远（世界像素）：骷髅手的捏合点对准 hang 帧里的 HERO.hangPinch */
  get hangOffsetY(): number { return this.hero ? (this.height / 2 - HERO.hangPinch.y) * this.scaleY : 0; }

  /** 按身体的状态挑动画：地上 跑 / 站；空中按竖直速度挑 上升 / 最高点 / 下落；俯视（吃豆人）走起来也用跑 */
  private animate(): void {
    if (!this.hero || this.action) return;
    const b = this.body, v = b.velocity;
    let key: string;
    if (!b.allowGravity) key = v.x !== 0 || v.y !== 0 ? 'run' : 'idle';
    else if (b.blocked.down || b.touching.down) key = v.x !== 0 && !(v.x < 0 ? b.blocked.left : b.blocked.right) ? 'run' : 'idle';
    else key = v.y < -APEX_SPEED ? 'jump_rise' : v.y <= APEX_SPEED ? 'jump_apex' : 'jump_fall';
    if (this.anims.currentAnim?.key !== key) this.play({ key, repeat: LOOPING.has(key) ? -1 : 0 });
  }

  /** 每帧：处理输入与跳跃，起跳时返回事件 */
  step(input: PlayerInput, time: number): JumpEvent | null {
    const c = this.cfg, b = this.body;
    const onGround = this.onGround, onWallL = this.onWallLeft, onWallR = this.onWallRight;
    // 爬起来的时候按方向键或跳：不等它播完，直接动
    if (this.action?.interruptible && (input.left || input.right || time - this.jumpPressedAt <= c.jumpBufferMs)) this.stopAction();

    if (time >= this.inputLockUntil) {
      if (input.left) { this.setVelocityX(-c.moveSpeed); this.setFlipX(true); }
      else if (input.right) { this.setVelocityX(c.moveSpeed); this.setFlipX(false); }
      else this.setVelocityX(0);
    }

    if ((onWallL || onWallR) && b.velocity.y > c.wallSlideMaxFall) this.setVelocityY(c.wallSlideMaxFall);

    if (onGround) { this.lastGroundedAt = time; this.lastGroundCell = this.groundCell(); }
    const canCoyote = time - this.lastGroundedAt <= c.coyoteMs && !!this.lastGroundCell;
    const wantsJump = time - this.jumpPressedAt <= c.jumpBufferMs;
    if (!wantsJump) return null;

    if (onGround || canCoyote) {
      const cell = onGround ? this.groundCell() : this.lastGroundCell!;
      this.setVelocityY(this.stageJump(c.jumpVelocity));
      this.consumeJump();
      this.kickSquash(SQUASH.jump);
      return { kind: 'ground', cell, dir: input.left ? -1 : input.right ? 1 : 0 };
    }
    if (onWallL || onWallR) {
      const side: 1 | -1 = onWallR ? 1 : -1;
      const cell = this.wallCell(side);
      this.setVelocityX(-side * c.wallJumpX);
      this.setVelocityY(this.stageJump(c.wallJumpY));
      this.setFlipX(side > 0);
      this.inputLockUntil = time + c.wallJumpLockMs;
      this.consumeJump();
      this.kickSquash(SQUASH.wallJump);
      return { kind: 'wall', cell, side };
    }
    return null;
  }

  /** 按长大阶段的起跳速度：jumpVelocityByStage[阶段]（没配就用 base）；蹬墙跳按原版的比例一起变（base / jumpVelocity） */
  private stageJump(base: number): number {
    const c = this.cfg, v = c.jumpVelocityByStage[this._stage];
    return v == null ? base : v * (base / c.jumpVelocity);
  }

  private consumeJump(): void { this.jumpPressedAt = -9999; this.lastGroundedAt = -9999; }

  // ---------- 挤压拉伸（纯视觉） ----------
  private kickSquash(amount: number): void { this.squash = amount; this.squashVel = 0; }

  /** POST_UPDATE：推进弹簧，然后把变形套到精灵上（脚底不动） */
  private applySquash(_time: number, delta: number): void {
    const b = this.body, dt = Math.min(delta, 50) / 1000;
    const grounded = b.blocked.down, live = b.moves && this.visible;
    if (live && grounded && !this.wasGrounded) {
      const impact = Phaser.Math.Clamp(this.airVy / SQUASH.landSpeed, 0, 1);
      if (impact >= SQUASH.landMin) this.kickSquash(-SQUASH.land * impact);
    }
    if (!grounded) this.airVy = b.velocity.y;
    this.wasGrounded = grounded;

    const target = live && !grounded ? Math.min(1, Math.abs(b.velocity.y) / SQUASH.airSpeed) * SQUASH.airMax : 0;
    this.squashVel += (SQUASH.stiffness * (target - this.squash) - SQUASH.damping * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    if (Math.abs(this.squash) < 1e-3 && Math.abs(this.squashVel) < 1e-2) { this.squash = 0; this.squashVel = 0; return; }

    const sx = this.scaleX, sy = this.scaleY;
    const qx = sx * (1 - this.squash * SQUASH.widthRatio), qy = sy * (1 + this.squash);
    const dy = this.height * sy * this.squash / 2;   // 原点在中心：往上挪半个多出来的高度，脚底留在原地
    this.setScale(qx, qy);
    this.y -= dy;
    this.unsquashed = { sx, sy, qx, qy, dy, qyPos: this.y };
  }

  /** PRE_UPDATE：物理之前撤销变形。只撤销自己加的那部分：中间被别的代码改过缩放 / 位置（复活、长大）就保留它们的 */
  private unsquash(): void {
    const u = this.unsquashed; if (!u) return;
    this.unsquashed = null;
    if (this.scaleX === u.qx && this.scaleY === u.qy) this.setScale(u.sx, u.sy);
    if (this.y === u.qyPos) this.y += u.dy;
  }

  freeze(tint: number): void { this.setTint(tint); this.setVelocity(0, 0); this.body.moves = false; }
  unfreeze(): void { this.clearTint(); this.body.moves = true; this.jumpPressedAt = -9999; }

  respawn(entry: EntryState): void {
    this.clearTint(); this.body.moves = true;
    this.setPosition(entry.x, entry.y); this.setVelocity(entry.vx, entry.vy);
    this.inputLockUntil = 0; this.lastGroundedAt = -9999; this.jumpPressedAt = -9999;
    this.squash = 0; this.squashVel = 0; this.airVy = entry.vy;
    this.action = null;
  }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }
}

/** 每张贴图每一帧最上面一行不透明像素（贴图原始像素）：第一次问到时把这一帧画到小画布上读一次，记下来 */
const TOP_ROWS = new Map<string, number>();
function topRow(p: Phaser.GameObjects.Sprite): number {
  const f = p.frame, id = `${p.texture.key}#${f.name}`;
  let row = TOP_ROWS.get(id);
  if (row === undefined) {
    row = 0;
    const canvas = document.createElement('canvas');
    canvas.width = f.cutWidth; canvas.height = f.cutHeight;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const a = g.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      for (let i = 3; i < a.length; i += 4) if (a[i]) { row = f.y + Math.floor((i >> 2) / f.cutWidth); break; }   // f.y：裁过边的图集要加回裁掉的那截
    }
    TOP_ROWS.set(id, row);
  }
  return row;
}
