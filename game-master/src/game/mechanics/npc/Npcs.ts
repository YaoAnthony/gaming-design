// ===== 会说话的角色：挡在路上，走近强制对话，每按一下说下一句，说完带着音效淡出 =====
// 消失是这一层内永久的，死亡重置不会把它带回来。
import Phaser from 'phaser';
import type { NpcSpawn } from '@/type';
import type { PlayContext, Suckable } from '@/game/core/PlayContext';
import type { Mechanic } from '../define';

interface Npc { spawn: NpcSpawn; sprite: Phaser.Physics.Arcade.Image; done: boolean }

/** 走到多近（格）开始说话 */
const TALK_RANGE_X = 1.5, TALK_RANGE_Y = 2;

export class Npcs implements Mechanic {
  private npcs: Npc[] = [];
  private bodies: Phaser.Physics.Arcade.StaticGroup;

  constructor(private ctx: PlayContext) {
    this.bodies = ctx.scene.physics.add.staticGroup();
  }

  addNpc(spawn: NpcSpawn): void {
    const sprite = this.bodies.create(spawn.x, spawn.y + this.ctx.cfg.tile / 2, spawn.texture) as Phaser.Physics.Arcade.Image;
    sprite.setOrigin(0.5, 1).setDepth(2.5).refreshBody();
    this.npcs.push({ spawn, sprite, done: false });
  }

  /** 角色是实心的，挡住玩家 */
  start(): void { this.ctx.scene.physics.add.collider(this.ctx.player, this.bodies); }

  /** 走到角色跟前就开始说话 */
  updateAlive(): void {
    const { ctx } = this;
    if (ctx.dialogue.talking) return;
    const T = ctx.cfg.tile, p = ctx.player.body;
    const npc = this.npcs.find(n => !n.done && Math.abs(p.center.x - n.sprite.x) < TALK_RANGE_X * T && Math.abs(p.bottom - n.sprite.y) < TALK_RANGE_Y * T);
    if (!npc) return;
    ctx.dialogue.talk({ name: npc.spawn.name, avatar: npc.spawn.avatar, lines: npc.spawn.lines }, () => this.leave(npc));
  }

  vortexTargets(): Suckable[] { return this.npcs.filter(n => n.sprite.active).map(n => n.sprite); }

  /** 说完了：带着音效淡出，路就通了 */
  private leave(n: Npc): void {
    const scene = this.ctx.scene;
    n.done = true;
    if (n.spawn.sound && scene.cache.audio.exists(n.spawn.sound)) scene.sound.play(n.spawn.sound, { volume: 0.9 });
    (n.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    scene.tweens.add({ targets: n.sprite, alpha: 0, y: n.sprite.y - 6, duration: 1400, ease: 'Sine.in', onComplete: () => n.sprite.destroy() });
  }
}
