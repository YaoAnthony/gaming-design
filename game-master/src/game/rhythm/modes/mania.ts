// ===== 节奏大师（2D）：四条道从钢琴往下铺到画面底边，音符从琴键上落下来，到线上时按那条道的键 =====
// 四条道上窄下宽（上面接着钢琴，下面和画面一样宽）：破屏到 3D 时屏幕往后一倒，这四条道正好接上画面外的大道。
// 从左到右四条道的键：A、W、S、D（方向键是 ← ↑ ↓ →）。按哪条道的键，小人就跳到哪条道的线上去接那个音符
import Phaser from 'phaser';
import { NoteTrack, RHYTHM_MODES } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, NoteSprites, Receptor, type Press } from './define';

const LANES = RHYTHM_MODES.mania.lanes;
/** 判定线在房间的多高（比例）；音符占道宽的多少、落到线上时多高（格）、刚出来时是到线上的几成大；按键时线上亮的那一块多高（格） */
const TRACK = { lineY: 0.86, width: 0.8, height: 0.5, startScale: 0.45, pad: 0.9, past: 1.06 };
/** 从左到右每条道按哪个方向、道底下写哪个键 */
const KEYS: { key: keyof Press; label: string }[] = [{ key: 'left', label: 'A' }, { key: 'up', label: 'W' }, { key: 'down', label: 'S' }, { key: 'right', label: 'D' }];

defineFlatMode('mania', (ctx, notes) => {
  const { scene, room, piano, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const topY = piano.y + piano.h, lineY = room.y + room.h * TRACK.lineY;
  /** 第 lane 条道的左边线在进度 p（0 = 钢琴底下，1 = 判定线）处的 x */
  const edgeX = (lane: number, p: number) => Phaser.Math.Linear(piano.x + piano.w * lane / LANES, room.x + room.w * lane / LANES, p);
  const y = (p: number) => Phaser.Math.Linear(topY, lineY, p);
  const midX = (lane: number) => (edgeX(lane, 1) + edgeX(lane + 1, 1)) / 2, laneW = room.w / LANES;
  // 道：五条边线 + 判定线 + 键位；每条道线上一块按键时会亮的亮片
  const guide = scene.add.graphics().setDepth(ctx.depth).setVisible(false);
  guide.lineStyle(2, Colors.dim, 0.9);
  for (let i = 0; i <= LANES; i++) guide.lineBetween(edgeX(i, 0), topY, edgeX(i, 1.2), y(1.2));
  guide.lineStyle(4, Colors.gold, 1); guide.lineBetween(room.x, lineY, room.x + room.w, lineY);
  const labels = KEYS.map((k, i) => scene.add.text(midX(i), lineY + T * 0.9, k.label, { fontFamily: 'monospace', fontSize: `${Math.round(T * 0.8)}px`, fontStyle: 'bold', color: '#ffd166' }).setOrigin(0.5).setDepth(ctx.depth + 1).setVisible(false));
  const receptors = KEYS.map((_, i) => new Receptor(scene, scene.add.rectangle(midX(i), lineY, laneW * 0.96, TRACK.pad * T, Colors.paper).setDepth(ctx.depth).setVisible(false)));
  const sprites = new NoteSprites(track, ctx.travelMs, TRACK.past,
    () => scene.add.rectangle(0, 0, 1, 1, Colors.violet).setStrokeStyle(2, Colors.paper).setDepth(ctx.depth + 1),
    (o, n, p) => {
      const left = edgeX(n.lane, p), right = edgeX(n.lane + 1, p), k = TRACK.startScale + (1 - TRACK.startScale) * Math.min(1, p);
      o.setPosition((left + right) / 2, y(p)).setSize((right - left) * TRACK.width, TRACK.height * T * k).setOrigin(0.5);
    });
  /** 小人现在在第几条道上（站在判定线上）：一开始在中间偏左那条 */
  let heroLane = 1;

  return {
    setActive(on) { guide.setVisible(on); labels.forEach(l => l.setVisible(on)); receptors.forEach(r => r.setVisible(on)); if (on) heroLane = 1; },
    update(now, press) {
      const w = ctx.config().windows;
      KEYS.forEach((k, lane) => {
        if (!press[k.key]) return;
        heroLane = lane;   // 跳到这条道上
        const hit = track.press(now, w, n => n.lane === lane);
        receptors[lane].pulse(hit?.judgement ?? null);
        if (hit) { burst(scene, midX(lane), lineY, T * 1.2, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
      });
      for (const n of track.sweep(now, w)) receptors[n.lane].pulse('miss');
      ctx.hero.setPosition(midX(heroLane), lineY - ctx.hero.displayHeight / 2);
    },
    draw(now) { sprites.draw(now); },
    destroy() { guide.destroy(); labels.forEach(l => l.destroy()); receptors.forEach(r => r.destroy()); sprites.destroy(); },
  };
});
