// ===== 骷髅王和他的钢琴：站在房间右边的地上（节奏关卡里 2D 画面上一直在的那部分）=====
// 开打之后跟着拍子一下一下地蹿。2D 的玩法里音符都从钢琴这边出来、往左边的主角那去；
// 3D 段落里从画面飞出去的音符（rhythm/modes.ts 的 fromScreen），先在画面里从钢琴落到画面底边对应的那条道上，
// 落到底的那一刻正好是它在 3D 里从屏幕冒出来的时刻，接得上。
import Phaser from 'phaser';
import type { RhythmConfig } from '@/type';
import { beatMs, RHYTHM_MODES, travelMsOf, type Note, type RhythmSession } from '@/rhythm';
import { Colors } from '@/game/palette';

/** 游戏世界里的一块矩形（像素） */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * 骷髅王站在房间的多靠右（宽度的比例）、放大几倍、每拍往上一蹿多少像素；
 * 钢琴（在他左手边）：离他多远、多宽、多高、琴键那一条多厚（格），几个白键；落下来的音符多大（像素）
 */
const BOSS = { x: 0.86, scale: 3, bounce: 8 };
const PIANO = { gap: 1.6, width: 3.4, height: 1.5, keys: 0.4, count: 10, drop: 20 };
/** 喊话：字多大（格）、在头顶上多高（格）、弹出来再飘走一共多久（毫秒） */
const SHOUT = { size: 0.85, lift: 0.6, ms: 1500 };

export class PianoBoss {
  private readonly objects: Phaser.GameObjects.GameObject[];
  private readonly boss: Phaser.GameObjects.Image;
  /** 琴键那一条占的矩形：音符从这出来 */
  readonly rect: Rect;
  /** 骷髅王的手在哪（道具从这扔出来） */
  readonly hand: { x: number; y: number };
  private readonly tile: number;
  /** 正在画面里往下落的音符 */
  private drops: { note: Note; dot: Phaser.GameObjects.Rectangle }[] = [];
  /** 下一个还没落的音符 */
  private next = 0;

  /** @param ground 地面的 y；tile 一格多少像素；depth 画在哪一层 */
  constructor(private readonly scene: Phaser.Scene, private readonly room: Rect, private readonly ground: number, tile: number, private readonly depth: number) {
    const bx = room.x + room.w * BOSS.x, pw = PIANO.width * tile, ph = PIANO.height * tile, px = bx - PIANO.gap * tile - pw;
    this.rect = { x: px, y: ground - ph, w: pw, h: PIANO.keys * tile };
    const keyW = pw / PIANO.count;
    const body = scene.add.rectangle(px + pw / 2, ground - ph / 2, pw, ph, Colors.ink).setStrokeStyle(2, Colors.paper).setDepth(depth);
    const keys = Array.from({ length: PIANO.count }, (_, i) => scene.add.rectangle(px + (i + 0.5) * keyW, this.rect.y + this.rect.h / 2, keyW - 2, this.rect.h, Colors.paper).setDepth(depth));
    this.boss = scene.add.image(bx, ground, 'skeleton').setOrigin(0.5, 1).setScale(BOSS.scale).setDepth(depth - 1);
    this.objects = [body, ...keys, this.boss];
    this.hand = { x: bx - tile, y: ground - this.boss.displayHeight * 0.5 };
    this.tile = tile;
  }

  /** 骷髅王喊一句：字从他头顶弹出来，往上飘着淡掉 */
  shout(text: string): void {
    const y = this.ground - this.boss.displayHeight - SHOUT.lift * this.tile;
    const label = this.scene.add.text(this.boss.x, y, text, { fontFamily: 'monospace', fontSize: `${Math.round(SHOUT.size * this.tile)}px`, fontStyle: 'bold', color: '#ffd166', stroke: '#0b0b14', strokeThickness: 6 })
      .setOrigin(0.85, 1).setDepth(this.depth + 3).setScale(0.3);
    this.scene.tweens.add({ targets: label, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: label, y: y - this.tile, alpha: 0, delay: SHOUT.ms * 0.55, duration: SHOUT.ms * 0.45, onComplete: () => label.destroy() });
  }

  /** 每帧。session = 正在打的那一场（没开打是 null：站着不动） */
  update(now: number, session: RhythmSession | null, cfg: RhythmConfig): void {
    if (!session) { this.boss.setY(this.ground); return; }
    const { chart, notes } = session, beat = beatMs(chart);
    // 跟着拍子蹿一下：拍点上最高，然后落回去
    const phase = (((now - chart.offsetMs) / beat) % 1 + 1) % 1;
    this.boss.setY(this.ground - BOSS.bounce * Math.exp(-phase * 5));
    // 该落的音符：到达时刻往前推「在 3D 里飞的时间 + 在画面里落的时间」就开始落
    const fall = cfg.dropBeats * beat, modeOf = (n: Note) => chart.sections[n.section].mode;
    const leaves = (n: Note) => n.timeMs - travelMsOf(chart, modeOf(n), cfg.travelBeats) - fall;
    while (this.next < notes.length && leaves(notes[this.next]) <= now) {
      const note = notes[this.next++];
      if (!RHYTHM_MODES[modeOf(note)].fromScreen) continue;
      const dot = this.scene.add.rectangle(0, 0, PIANO.drop, PIANO.drop, note.char === '_' ? Colors.gold : Colors.rose).setDepth(this.depth + 1);
      this.drops.push({ note, dot });
    }
    const from = this.rect, r = this.room;
    this.drops = this.drops.filter(({ note, dot }) => {
      const k = (now - leaves(note)) / fall;
      if (k >= 1) { dot.destroy(); return false; }
      const u = (note.lane + 0.5) / RHYTHM_MODES[modeOf(note)].lanes;
      // 从琴键上弹起来，划一道弧线落到画面底边那条道上
      dot.setPosition(Phaser.Math.Linear(from.x + from.w / 2, r.x + u * r.w, k), Phaser.Math.Linear(from.y, r.y + r.h, k * k) - Math.sin(Math.PI * k) * from.h * 6);
      return true;
    });
  }

  /** 一场打完：还没落完的收掉，下一场从头数 */
  reset(): void { this.drops.forEach(d => d.dot.destroy()); this.drops = []; this.next = 0; }

  destroy(): void { this.reset(); this.objects.forEach(o => o.destroy()); }
}
