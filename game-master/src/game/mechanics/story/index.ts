// ===== 通用机制：主线剧情（story/ 里是剧情的数据，这里是它在游戏里的那一部分）=====
// 每一层都启用：
// - 标题画面（启动数据 opening）：骷髅手一挥、房间从天上砸下来，再拍菜单，选了「开始」主角才出场（Opening.ts）
// - Game Master 的化身 g（第一层房间 P，城堡前面）：第一幕通关之后走近自动说剧本，中间插演出，最后把主角拖进关卡编辑器（Gm.ts）
// - 第二幕（存档里有 act2.editor）：游戏画面外面套着关卡编辑器
import { STORY } from '@/story/flags';
import { STORY_MUSIC } from '@/story/config';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';
import { Opening } from './Opening';
import { Gm } from './Gm';
import { Colors } from '@/shared/palette';

class StoryMechanic implements Mechanic {
  readonly gm: Gm;
  private opening: Opening | null = null;

  constructor(private readonly ctx: PlayContext) {
    this.gm = new Gm(ctx);
    if (ctx.start.opening) this.opening = new Opening(ctx, fresh => { if (fresh) ctx.newGame(); else ctx.enter(); });
  }

  start(): void {
    this.gm.start();
    this.ctx.hud.editorShell({ on: this.ctx.story.has(STORY.act2Editor), gm: this.ctx.story.has(STORY.act2Editor) });
    if (this.opening) {
      this.ctx.music.play(STORY_MUSIC.opening);
      this.opening.begin();
    }
  }

  delaysEntrance(): boolean { return !!this.opening; }

  updateAlive(): void { this.gm.updateAlive(); }

  takesControl(): boolean { return this.gm.busy; }

  onReset(): void { this.gm.onReset(); }

  destroy(): void {
    this.opening?.destroy();
    this.gm.destroy();
  }
}

const story = defineMechanic({
  id: 'story', name: '主线剧情', desc: '标题画面、Game Master 的化身和他的剧本（剧情数据在 src/story/）',
  scope: 'global',
  activeOn: () => true,
  create: ctx => new StoryMechanic(ctx),
});

story.entity({
  id: 'g', name: 'Game Master', desc: 'GM 的化身：第一幕通关之后走近自动说剧本（story/scripts/gm.ts），最后把主角拖进关卡编辑器。挡在路上，说完就不在了', texture: 'skeleton', color: Colors.paper, origin: [0.5, 1],
  spawn: (m, at) => m.gm.add(at),
});
