// ===== 骷髅王在房间里弹钢琴（节奏关卡里 2D 画面上一直在的那部分）=====
// 跟着拍子一下一下地蹿；3D 段落里从画面飞出去的音符（rhythm/modes.ts 的 fromScreen），先在画面里从钢琴落到画面底边对应的那条道上，
// 落到底的那一刻正好是它在 3D 里从屏幕冒出来的时刻，接得上。
import Phaser from 'phaser';
import type { RhythmConfig } from '@/type';
import { beatMs, RHYTHM_MODES, type Note, type RhythmSession } from '@/rhythm';
import { Colors } from '@/game/palette';

/** 页面上的一块矩形（游戏世界的像素） */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * 钢琴：中心在房间的哪（宽高的比例）、多宽（房间宽的比例）多高（像素）、几个白键；
 * 骷髅王放大几倍、每拍往上一蹿多少像素；落下来的音符多大（像素）
 */
const PIANO = { x: 0.5, y: 0.27, width: 0.5, height: 36, keys: 16, bossScale: 3, bounce: 8, drop: 20 };

export class PianoBoss {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private boss: Phaser.GameObjects.Image | null = null;
  private bossY = 0;
  /** 正在画面里往下落的音符 */
  private drops: { note: Note; dot: Phaser.GameObjects.Rectangle }[] = [];
  /** 下一个还没落的音符 */
  private next = 0;

  /** @param depth 画在哪一层（钢琴在这一层，骷髅王在它后面一层，落下来的音符在前面一层） */
  constructor(private readonly scene: Phaser.Scene, private readonly session: RhythmSession, private readonly room: Rect, private readonly depth: number) {
    const p = this.rect, keyW = p.w / PIANO.keys;
    const body = scene.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w + 12, p.h + 12, Colors.ink).setStrokeStyle(2, Colors.paper).setDepth(depth);
    const keys = Array.from({ length: PIANO.keys }, (_, i) => scene.add.rectangle(p.x + (i + 0.5) * keyW, p.y + p.h / 2, keyW - 2, p.h, Colors.paper).setDepth(depth));
    this.bossY = p.y - 4;
    this.boss = scene.add.image(p.x + p.w / 2, this.bossY, 'skeleton').setOrigin(0.5, 1).setScale(PIANO.bossScale).setDepth(depth - 1);
    this.objects = [body, ...keys, this.boss];
  }

  /** 琴键那一条占的矩形 */
  get rect(): Rect {
    const r = this.room, w = r.w * PIANO.width;
    return { x: r.x + r.w * PIANO.x - w / 2, y: r.y + r.h * PIANO.y, w, h: PIANO.height };
  }

  update(now: number, cfg: RhythmConfig): void {
    const { chart, notes } = this.session, beat = beatMs(chart);
    // 跟着拍子蹿一下：拍点上最高，然后落回去
    const phase = (((now - chart.offsetMs) / beat) % 1 + 1) % 1;
    this.boss?.setY(this.bossY - PIANO.bounce * Math.exp(-phase * 5));
    // 该落的音符：到达时刻往前推「在 3D 里飞的时间 + 在画面里落的时间」就开始落
    const travel = cfg.travelBeats * beat, fall = cfg.dropBeats * beat;
    while (this.next < notes.length && notes[this.next].timeMs - travel - fall <= now) {
      const note = notes[this.next++];
      if (!RHYTHM_MODES[chart.sections[note.section].mode].fromScreen) continue;
      const dot = this.scene.add.rectangle(0, 0, PIANO.drop, PIANO.drop, note.char === '_' ? Colors.gold : Colors.rose).setDepth(this.depth + 1);
      this.drops.push({ note, dot });
    }
    const from = this.rect, r = this.room;
    this.drops = this.drops.filter(({ note, dot }) => {
      const k = (now - (note.timeMs - travel - fall)) / fall;
      if (k >= 1) { dot.destroy(); return false; }
      const u = (note.lane + 0.5) / RHYTHM_MODES[chart.sections[note.section].mode].lanes;
      dot.setPosition(Phaser.Math.Linear(from.x + u * from.w, r.x + u * r.w, k), Phaser.Math.Linear(from.y + from.h, r.y + r.h, k * k));   // 越落越快
      return true;
    });
  }

  destroy(): void {
    this.objects.forEach(o => o.destroy()); this.objects = [];
    this.drops.forEach(d => d.dot.destroy()); this.drops = [];
    this.boss = null;
  }
}
