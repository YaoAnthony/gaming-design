// ===== 实心体登记：谁是会动的实心地形（移动方块、纸），谁要站在它们上面（箱子、钥匙）=====
// 机制在构造时把自己的物理组登记进来，碰撞器由这里统一挂：每个平台 × 玩家、怪物、所有箱子和钥匙。
// 这样机制之间不用互相打听（以前靠 mech('pushBlock').terrainBodies()），要找箱子 / 钥匙 / 平台的物理体也从这里拿。
// 玩家建好之前登记的先记着，start() 时一起挂；之后再登记的立刻挂。同类之间（箱子和箱子、钥匙和箱子）的碰撞规则各机制自己挂
import type Phaser from 'phaser';

export type SolidKind = 'platform' | 'crate' | 'key';
type Group = Phaser.Physics.Arcade.Group;
type Process = Phaser.Types.Physics.Arcade.ArcadePhysicsCallback;

interface Entry {
  group: Group;
  kind: SolidKind;
  /** 平台和玩家撞时的判断（比如纸正压在头上时不挡） */
  playerProcess?: Process;
}

export class Solids {
  private entries: Entry[] = [];
  private started = false;
  private paired = new Set<Group>();

  /** @param actors 玩家和怪物组（玩家在 start() 之后才有，所以传取值函数） */
  constructor(private readonly scene: Phaser.Scene, private readonly actors: () => { player: Phaser.GameObjects.GameObject; enemies: Group }) {}

  register(group: Group, kind: SolidKind, playerProcess?: Process): void {
    const e: Entry = { group, kind, playerProcess };
    this.entries.push(e);
    if (this.started) this.wire(e);
  }

  /** 玩家建好之后调一次：把已经登记的都挂上碰撞器 */
  start(): void {
    this.started = true;
    this.entries.forEach(e => this.wire(e));
  }

  groups(kind: SolidKind): Group[] { return this.entries.filter(e => e.kind === kind).map(e => e.group); }

  /** 这一类现在所有还在的物理体 */
  bodies(kind: SolidKind): Phaser.Physics.Arcade.Body[] {
    return this.groups(kind).flatMap(g => g.getChildren().map(o => (o as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body | null)).filter((b): b is Phaser.Physics.Arcade.Body => !!b);
  }

  /** 给这一条挂碰撞器：平台对玩家、怪物和所有骑手；骑手对所有平台。已经挂过的组合不重复挂 */
  private wire(e: Entry): void {
    const { player, enemies } = this.actors();
    const platforms = e.kind === 'platform' ? [e] : this.entries.filter(o => o.kind === 'platform' && this.paired.has(o.group));
    const riders = e.kind === 'platform' ? this.entries.filter(o => o.kind !== 'platform' && this.paired.has(o.group)) : [e];
    if (e.kind === 'platform') {
      this.scene.physics.add.collider(player, e.group, undefined, e.playerProcess);
      this.scene.physics.add.collider(enemies, e.group);
    }
    platforms.forEach(p => riders.forEach(r => this.scene.physics.add.collider(r.group, p.group)));
    this.paired.add(e.group);
  }
}
