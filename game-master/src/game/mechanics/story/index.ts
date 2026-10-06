// ===== 通用机制：主线剧情（story/ 里是剧情的数据，这里是它在游戏里的那一部分）=====
// 每一层都启用：
// - 标题画面（启动数据 opening）：骷髅手先把房间搭出来、拍菜单，选了「开始」主角才出场（Opening.ts）
// - 剧情墙 Y：第一幕在庆祝画面上按了「继续」才塌开，通往施工区（Gates.ts）
// - 施工区的道具：施工牌 W、线框格 L、素材堆 U、散落的菜单按钮 J（Props.ts）
// - Game Master 的化身 g：走近自动说剧本，中间插演出，最后把主角拖进关卡编辑器（Gm.ts）
// - 第二幕（存档里有 act2.editor）：游戏画面外面套着关卡编辑器
import type { CellRef } from '@/type';
import { STORY } from '@/story/flags';
import { STORY_MUSIC } from '@/story/config';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';
import { Opening } from './Opening';
import { bakeGates, Gates } from './Gates';
import { Props } from './Props';
import { Gm } from './Gm';
import { Colors } from '@/shared/palette';

class StoryMechanic implements Mechanic {
  readonly gates: Gates;
  readonly props: Props;
  readonly gm: Gm;
  private opening: Opening | null = null;

  constructor(private readonly ctx: PlayContext, gates: CellRef[]) {
    this.gates = new Gates(ctx, gates ?? []);
    this.props = new Props(ctx);
    this.gm = new Gm(ctx);
    if (ctx.start.opening) this.opening = new Opening(ctx, fresh => { if (fresh) ctx.newGame(); else ctx.enter(); });
  }

  start(): void {
    this.gates.start();
    this.gm.start();
    this.ctx.hud.editorShell({ on: this.ctx.story.has(STORY.act2Editor), gm: this.ctx.story.has(STORY.act2Editor) });
    if (this.opening) {
      this.ctx.music.play(STORY_MUSIC.opening);
      this.opening.begin();
    }
  }

  delaysEntrance(): boolean { return !!this.opening; }

  updateAlive(): void {
    this.props.updateAlive();
    this.gm.updateAlive();
  }

  takesControl(): boolean { return this.gm.busy; }

  onReset(): void {
    this.gates.onReset();
    this.gm.onReset();
  }

  destroy(): void {
    this.opening?.destroy();
    this.gm.destroy();
  }
}

const story = defineMechanic({
  id: 'story', name: '主线剧情', desc: '标题画面、剧情墙、施工区、Game Master 的化身（剧情数据在 src/story/）',
  scope: 'global',
  activeOn: () => true,
  bake: bakeGates,
  create: (ctx, data) => new StoryMechanic(ctx, data as CellRef[]),
});

story.entity({
  id: 'Y', name: '剧情墙', desc: '看着是岩石；第一幕在庆祝画面上按了「继续」才塌开', texture: 'story_gate', color: Colors.dim,
  spawn: () => {},   // bake 已经把它烘成岩石了
});
story.entity({
  id: 'W', name: '施工牌', desc: '施工区的牌子（不挡人）', texture: 'story_sign', color: Colors.gold, origin: [0.5, 1],
  spawn: (m, at) => m.props.sign(at),
});
story.entity({
  id: 'L', name: '线框格', desc: '还没画上砖的格子：一闪一闪的虚线框（不挡人）', texture: 'story_wire', color: 0x8fd3ff,
  spawn: (m, at) => m.props.wire(at),
});
story.entity({
  id: 'U', name: '素材堆', desc: '散在施工区的一堆砖块素材（不挡人）', texture: 'story_pile', color: 0xd9a066, origin: [0.5, 1],
  spawn: (m, at) => m.props.pile(at),
});
story.entity({
  id: 'J', name: '菜单按钮', desc: '散落的菜单按钮：按出现顺序轮着是开始 / 设置 / 退出，踩上去按下', texture: 'story_button', color: 0x4a55a0, origin: [0.5, 1],
  spawn: (m, at) => m.props.button(at),
});
story.entity({
  id: 'g', name: 'Game Master', desc: 'GM 的化身：走近自动说剧本（story/scripts/gm.ts），最后把主角拖进关卡编辑器', texture: 'skeleton', color: Colors.paper, origin: [0.5, 1],
  spawn: (m, at) => m.gm.add(at),
});
