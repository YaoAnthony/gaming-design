// ===== 通用机制：节奏关卡（Game Master 弹钢琴的 Boss 战，实现在 RhythmFight.ts）=====
// 每一层都启用：
// - 听 EVT.rhythmStart / rhythmStop（开发键 B、技术验证编辑器）：这张谱有自己的场地、人又不在那一层，就先传过去，到了那边自己开打
// - 这一层是哪张谱的场地（chart.arena）：进层时把场子摆好，人一落地就开打（技术验证编辑器的试玩除外：等它发 test）
// 开打以后按键和人归它管（takesControl）：场景不让人走、不响应跳和 R。开场白、换段前的台词写在谱面里（chart.intro）。
import { bridge, EVT, type RhythmStart } from '@/protocol';
import { chartById, chartOfArena, type ChartIntro } from '@/rhythm';
import { NO_MUSIC } from '@/asset';
import { Colors, hex } from '@/shared/palette';
import { tr } from '@/i18n';
import type { PlayContext } from '@/game/core/PlayContext';
import { defineMechanic, type Mechanic } from '../define';
import { RhythmFight } from './RhythmFight';

/** 破屏那一下镜头白闪多久（毫秒） */
const BREAK_FLASH_MS = 220;

class RhythmMechanic implements Mechanic {
  private readonly fight: RhythmFight;
  /** 正在打 / 摆着的这张谱的开场白（谁说、说什么） */
  private intro: ChartIntro | null = null;

  constructor(private readonly ctx: PlayContext) {
    const { scene, terrain, cfg } = ctx, T = cfg.tile;
    const speaker = () => this.intro?.speaker ?? 'npc.gameMaster';
    this.fight = new RhythmFight({
      scene, cfg, player: () => ctx.player, held: () => ctx.held(),
      standAt: () => ctx.entry,
      groundBelow: (x, y) => {   // 从这一格往下找到第一格实心的，地面就是它的顶
        const cx = Math.floor(x / T);
        let cy = Math.floor(y / T);
        while (cy < terrain.h && !terrain.isSolid(cx, cy)) cy++;
        return cy * T;
      },
      canStart: () => !ctx.busy && ctx.player.body.blocked.down,
      away: () => ctx.away, popOut: from => ctx.popOut(from),
      // 开场白：前几句跳一下翻一句；后面的跳不过去，自己往下走（越说越大、最后砸下一行大字）
      talk: (locked, done) => {
        const intro = this.intro;
        if (!intro) { locked(); done(); return; }
        ctx.dialogue.talk({ name: intro.speaker, avatar: intro.avatar, lines: intro.talk.map(text => ({ text, pos: 'top' as const })) }, () => {
          locked();
          ctx.dialogue.cutscene(intro.speaker, intro.locked.map(l => ({ text: l.text, autoMs: l.ms, grow: l.grow, shout: l.shout, pos: 'top' as const })), scene.time.now, done);
        });
      },
      say: (line, ms, done) => ctx.dialogue.cutscene(speaker(), [{ text: line, autoMs: ms, pos: 'top' }], scene.time.now, done),
      // 打的时候这一层的音乐让位给那首曲子，打完音乐回来
      onBegin: () => ctx.music.play(NO_MUSIC), onEnd: () => ctx.music.playBase(),
      onMode: mode => ctx.hud.rhythmMode(mode),
      taunt: mode => tr(`rhythm.taunt.${mode}`),
      onScore: v => {
        ctx.hud.score(v ? v.points : null);
        if (!v || v.judge || v.fresh) ctx.hud.rhythm(v && { combo: v.combo, judge: v.judge });   // 自动判的只动分数，不把上一次的判定字冲掉
      },
      onBoss: v => ctx.hud.boss(v),
      onHp: v => ctx.hud.hearts(v && { ...v, tiered: true }),   // null：打完换回平时的心
      onBreak: () => { ctx.hud.whiteout(); scene.cameras.main.flash(BREAK_FLASH_MS); },
      onResult: (won, percent, test) => {
        ctx.fx.flash(won ? 'rhythm.won' : 'rhythm.lost', hex(won ? Colors.mint : Colors.rose), { percent });
        if (won && !test && chartOfArena(ctx.floor.id)) ctx.win(true);   // 在场地上打赢了：通关（试玩不算）
      },
    });
    bridge.on(EVT.rhythmStart, this.onStart);
    bridge.on(EVT.rhythmStop, this.onStop);
  }

  /** 这一层是哪张谱的场地：Game Master 已经在等了，人一落地就开打（技术验证编辑器的试玩：摆好场子等着） */
  start(): void {
    const chart = chartOfArena(this.ctx.floor.id);
    if (!chart) return;
    this.intro = chart.intro ?? null;
    this.fight.stage(chart.id, !this.ctx.start.rhythmLab);
  }

  update(): void { this.fight.update(); }

  takesControl(): boolean { return this.fight.active; }

  destroy(): void {
    bridge.off(EVT.rhythmStart, this.onStart);
    bridge.off(EVT.rhythmStop, this.onStop);
    this.fight.destroy();
  }

  /** 开一场：这张谱有自己的场地、人又不在那一层，就先传过去（到了那边自己开打）；否则就地开 */
  private readonly onStart = (r: RhythmStart): void => {
    const chart = chartById(r.chartId);
    if (!chart) return;
    if (!chart.arena || chart.arena === this.ctx.floor.id) {
      this.intro = chart.intro ?? null;
      this.fight.start(chart.id, r.test);
      return;
    }
    if (this.ctx.busy || this.fight.active) return;
    this.ctx.goToFloor(chart.arena);
  };

  private readonly onStop = (): void => this.fight.stop();
}

defineMechanic({
  id: 'rhythm', name: '节奏关卡', desc: 'Game Master 弹钢琴的 Boss 战：跟着曲子玩，每一段换一种玩法（场地 = 谱面的 arena）',
  scope: 'global',
  activeOn: () => true,
  create: ctx => new RhythmMechanic(ctx),
});
