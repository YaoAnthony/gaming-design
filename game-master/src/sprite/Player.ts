// ===== 玩家：移动、滑墙、蹬墙跳、土狼时间、跳跃缓冲 =====
// 起跳后返回 JumpEvent（起跳类型 + 爆炸中心格），爆炸本身由场景处理。
import Phaser from 'phaser';
import type { CellRef, EntryState, GameConfig } from '@/type';

/** 三个阶段的身体贴图：第 1 关 1 格高、第 2 关 1.5 格高、第 3 关 2 格高（没注册的就拿现有的拉高） */
const STAGE_TEXTURES = ['player', 'player_mid', 'player_tall'];
/** 每长大一阶多高（格） */
export const STAGE_EXTRA = 0.5;
/** 最高长到第几阶 */
export const MAX_STAGE = STAGE_TEXTURES.length - 1;

export interface PlayerInput { left: boolean; right: boolean }
export interface JumpEvent { kind: 'ground' | 'wall'; cell: CellRef; /** 蹬墙跳时墙在哪一侧 */ side?: 1 | -1; /** 起跳时按着的方向 */ dir?: -1 | 0 | 1 }

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private lastGroundedAt = -9999;
  private jumpPressedAt = -9999;
  private inputLockUntil = 0;
  private lastGroundCell: CellRef | null = null;
  /** 脚下平台（比如被怪物驮着的纸）的水平速度，叠加到自己的速度上——走物理，撞墙会被挡 */
  rideVx = 0;
  /** 头上额外的高度（格），戴帽子时是 hatHeight */
  private extra = 0;
  /** 长大阶段：0 = 第 1 关 1 格高，1 = 第 2 关 1.5 格，2 = 第 3 关 2 格 */
  private _stage = 0;
  /** 现在比本来多高（格）：平时 = stage * STAGE_EXTRA，长大动画中是中间值（贴图和碰撞框一起变高） */
  private growth = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, private cfg: GameConfig) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    this.applyShape();
    this.body.setMaxVelocityY(cfg.maxFall);
  }

  setConfig(cfg: GameConfig): void { this.cfg = cfg; }

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
    // 已经长到的整阶用它的贴图（没注册的往下找有的）
    for (let s = Math.floor(this.growth / STAGE_EXTRA + 1e-6); s >= 0; s--) {
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
    this.setScale(c.playerWidth * T / fw, visible * T / fh);
    const k = (visible + this.extra) / visible;                          // 帽子：碰撞框再往上长
    const hw = fw * Math.min(1, c.playerHitboxWidth / c.playerWidth);   // 碰撞框宽（贴图原始像素）
    this.body.setSize(hw, fh * k, false);
    this.body.setOffset((fw - hw) / 2, fh - fh * k);                     // 左右居中；往上长：偏移是负的，底边还在贴图底边
  }
  pressJump(now: number): void { this.jumpPressedAt = now; }

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

  /** 每帧：处理输入与跳跃，起跳时返回事件 */
  step(input: PlayerInput, time: number): JumpEvent | null {
    const c = this.cfg, b = this.body;
    const onGround = this.onGround, onWallL = this.onWallLeft, onWallR = this.onWallRight;

    if (time >= this.inputLockUntil) {
      if (input.left) { this.setVelocityX(-c.moveSpeed + this.rideVx); this.setFlipX(true); }
      else if (input.right) { this.setVelocityX(c.moveSpeed + this.rideVx); this.setFlipX(false); }
      else this.setVelocityX(this.rideVx);
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


  freeze(tint: number): void { this.setTint(tint); this.setVelocity(0, 0); this.body.moves = false; }
  unfreeze(): void { this.clearTint(); this.body.moves = true; this.jumpPressedAt = -9999; }

  respawn(entry: EntryState): void {
    this.clearTint(); this.body.moves = true;
    this.setPosition(entry.x, entry.y); this.setVelocity(entry.vx, entry.vy);
    this.inputLockUntil = 0; this.lastGroundedAt = -9999; this.jumpPressedAt = -9999;
  }

  rect(): Phaser.Geom.Rectangle { const b = this.body; return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }
}
