// ===== Game Master 的化身（第一层房间 P，挡在城堡前面的那个骷髅）和它的剧本 =====
// 第一幕通关之后（看过「你赢了！」）走近自动开始说（story/scripts/gm.ts），跳一下翻一句；没通关之前他只是挡在那。剧本里的演出交给界面一侧放（EVT.storyCutscene），
// 演出期间人不归玩家管（takesControl）。中途被打断（死了、重置）：下次走近从最后记下的那个标记之后接着说。
// 说完 GM 被拖进了关卡编辑器（存档里记着 act2.editor）：之后进这一层他就不在了，编辑器改造过的格子直接画好。
import Phaser from 'phaser';
import type { Point, RoomCoord } from '@/type';
import { AIR } from '@/game/registry/registry';
import { bridge, EVT, type PaintCell, type ScreenSpot, type StoryCutscene, type StoryCutsceneDone } from '@/protocol';
import type { PlayContext } from '@/game/core/PlayContext';
import { chunksOf, resumeIndex, type ScriptChunk } from '@/story/script';
import { GM_SCRIPT } from '@/story/scripts/gm';
import { CUTSCENES, type CutsceneId } from '@/story/cutscenes';
import { MONTAGE } from '@/story/montage';
import { STORY } from '@/story/flags';
import { Colors, hex } from '@/shared/palette';
import { DEPTH } from '@/game/depth';

/** 走到多近（格）开始说话 */
const TALK_RANGE_X = 2.5, TALK_RANGE_Y = 2;

export class Gm {
  private sprite: Phaser.Physics.Arcade.Image | null = null;
  private bodies: Phaser.Physics.Arcade.StaticGroup;
  /** GM 所在的房间（编辑器改造的就是这个房间） */
  private room: RoomCoord | null = null;
  private readonly chunks: ScriptChunk[] = chunksOf(GM_SCRIPT);
  /** 剧本走到第几段；idle = 还没开始 / 被打断了 */
  private at = 0;
  private phase: 'idle' | 'talk' | 'cutscene' | 'done' = 'idle';
  private cutscene: CutsceneId | null = null;

  constructor(private readonly ctx: PlayContext) {
    this.bodies = ctx.scene.physics.add.staticGroup();
    bridge.on(EVT.storyCutsceneDone, this.onCutsceneDone);
    bridge.on(EVT.storyPaint, this.onPaint);
  }

  add(at: Point & { cell: RoomCoord }): void {
    this.room = { rx: at.cell.rx, ry: at.cell.ry };
    if (this.ctx.story.has(STORY.metGM)) return;   // 已经被拖进编辑器了
    const sprite = this.bodies.create(at.x, at.y + this.ctx.cfg.tile / 2, 'skeleton') as Phaser.Physics.Arcade.Image;
    sprite.setOrigin(0.5, 1).setDepth(DEPTH.storyProp + 0.5).refreshBody();
    this.sprite = sprite;
  }

  start(): void {
    if (this.sprite) this.ctx.scene.physics.add.collider(this.ctx.player, this.bodies);
    if (this.ctx.story.has(STORY.act2Editor)) this.paintAll();   // 读档回来：编辑器改过的格子直接画好
  }

  /** 演出中：人不归玩家管 */
  get busy(): boolean { return this.phase === 'cutscene'; }

  updateAlive(): void {
    const { ctx } = this;
    // 说到一半被打断了（死了、重置：对话框被收掉了，说完的回调不会来）
    if (this.phase === 'talk' && !ctx.dialogue.talking) this.phase = 'idle';
    if (this.phase !== 'idle' || !this.sprite || ctx.dialogue.talking || !ctx.story.has(STORY.act1Won)) return;
    const T = ctx.cfg.tile, p = ctx.player.body;
    if (Math.abs(p.center.x - this.sprite.x) > TALK_RANGE_X * T || Math.abs(p.bottom - this.sprite.y) > TALK_RANGE_Y * T) return;
    this.at = this.resumeAt();
    this.next();
  }

  onReset(): void {
    if (this.ctx.story.has(STORY.act2Editor)) this.paintAll();
  }

  destroy(): void {
    bridge.off(EVT.storyCutsceneDone, this.onCutsceneDone);
    bridge.off(EVT.storyPaint, this.onPaint);
  }

  /** 从哪一段接着说：最后一个已经记下的标记之后 */
  private resumeAt(): number { return resumeIndex(this.chunks, f => this.ctx.story.has(f)); }

  /** 走下一段 */
  private next(): void {
    const c = this.chunks[this.at++];
    if (!c) { this.phase = 'done'; return; }
    if (c.kind === 'flag') { this.ctx.story.flag(c.flag); this.next(); return; }
    if (c.kind === 'talk') {
      this.phase = 'talk';
      this.ctx.dialogue.talk({
        name: GM_SCRIPT.speaker, avatar: GM_SCRIPT.avatar,
        lines: c.lines.map(l => ({ text: l.text, avatar: l.avatar, autoMs: l.autoMs, think: l.think, pos: 'top' as const })),
      }, () => this.next());
      return;
    }
    this.play(c.id);
  }

  /** 放一段演出：把要用的位置一起给界面一侧 */
  private play(id: CutsceneId): void {
    const { ctx } = this;
    this.phase = 'cutscene';
    this.cutscene = id;
    const p = ctx.player;
    p.setVelocity(0, 0);
    const msg: StoryCutscene = { id };
    if (id === CUTSCENES.pullEditor) {
      msg.hero = { ...this.spotOf(p.x, p.y), ...this.sizeOf(p.displayWidth, p.displayHeight), texture: p.portraitKey };
      p.setVisible(false);   // 演出里换成手拎着的那张图
    } else if (id === CUTSCENES.dragGM && this.sprite) {
      const s = this.sprite;
      msg.gm = { ...this.spotOf(s.x, s.y - s.displayHeight / 2), ...this.sizeOf(s.displayWidth, s.displayHeight), texture: 'skeleton' };
      s.setVisible(false);
    } else if (id === CUTSCENES.editorMontage) {
      msg.paint = this.montagePlan();
    }
    bridge.emit(EVT.storyCutscene, msg);
  }

  private readonly onCutsceneDone = (d: StoryCutsceneDone): void => {
    if (this.phase !== 'cutscene' || d.id !== this.cutscene) return;
    const id = this.cutscene;
    this.cutscene = null;
    if (id === CUTSCENES.pullEditor) this.ctx.player.setVisible(true);
    if (id === CUTSCENES.dragGM && this.sprite) { this.sprite.destroy(); this.sprite = null; }
    if (id === CUTSCENES.editorMontage) {
      this.paintAll();   // 演出里没画上的（窗口太小、跳过了）补上
      this.ctx.fx.flash('msg.toBeContinued', hex(Colors.gold));
    }
    this.next();
  };

  /** 骷髅手在编辑器里点下了一格 */
  private readonly onPaint = (c: PaintCell): void => { this.paintCell(c.x, c.y, c.tile, true); };

  /** 编辑器改造要画的格子：每一笔一组，跳过已经有东西的格子和人站着的地方 */
  private montagePlan(): PaintCell[][] {
    return this.montageCells().map(stroke => stroke.map(c => ({ ...c, spot: this.spotOf((c.x + 0.5) * this.ctx.cfg.tile, (c.y + 0.5) * this.ctx.cfg.tile) })));
  }

  private montageCells(): { x: number; y: number; tile: string }[][] {
    if (!this.room) return [];
    const { ctx } = this, x0 = this.room.rx * ctx.rooms.w, y0 = this.room.ry * ctx.rooms.h;
    return MONTAGE.map(s => s.cells.map(([x, y]) => ({ x: x0 + x, y: y0 + y, tile: s.tile })).filter(c => this.paintable(c.x, c.y)));
  }

  /** 一下子全画上（不演） */
  private paintAll(): void {
    this.montageCells().flat().forEach(c => this.paintCell(c.x, c.y, c.tile, false));
  }

  private paintable(x: number, y: number): boolean {
    const { ctx } = this, T = ctx.cfg.tile, b = ctx.player.body;
    if (x < 0 || y < 0 || x >= ctx.terrain.w || y >= ctx.terrain.h || ctx.terrain.get(x, y) !== AIR || ctx.occupied(x, y)) return false;
    return !(b.right > x * T && b.x < (x + 1) * T && b.bottom > y * T && b.y < (y + 1) * T);
  }

  private paintCell(x: number, y: number, tile: string, fx: boolean): void {
    const { ctx } = this, T = ctx.cfg.tile;
    if (!this.paintable(x, y)) return;
    ctx.terrain.set(x, y, tile);
    ctx.terrain.resolveSupportNear([{ x, y }]);
    ctx.fx.fogDirty();
    if (fx) ctx.sparks.explode(6, x * T + T / 2, y * T + T / 2);
  }

  private spotOf(x: number, y: number): ScreenSpot {
    const cam = this.ctx.scene.cameras.main;
    return { x: (x - cam.scrollX) / cam.width, y: (y - cam.scrollY) / cam.height };
  }

  private sizeOf(w: number, h: number): { w: number; h: number } {
    const cam = this.ctx.scene.cameras.main;
    return { w: w / cam.width, h: h / cam.height };
  }
}
