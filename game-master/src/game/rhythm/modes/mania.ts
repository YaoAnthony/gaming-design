// ===== 节奏大师（2D）：三条道竖着铺在钢琴左边（不挡骷髅王），音符从上面落下来，落到地面那条线上时按那条道的键 =====
// 从左到右三条道的键：A、S、D（方向键是 ← ↓ →）。按哪条道的键，小人就跑到哪条道上去接那个音符。
// 长的音符是长按：头落到线上时按下，一直按住到尾巴过线才松手。
// 拍子看得见：每一拍有一条横线跟着音符一起落下来（小节线更亮），落到判定线上的那一刻判定线亮一下。
import Phaser from 'phaser';
import { MANIA_KEYS, NoteTrack, RHYTHM_MODES } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, makeKit, NoteSprites, Receptor, tossIn, tossOut } from './define';

const LANES = RHYTHM_MODES.mania.lanes;
/** 判定线比地面高多少（格）；音符占道宽的多少、多高（格）；按键时线上亮的那一块多高（格）；键位写在地面下面多深（格）；gap = 最右边那条道离钢琴多远（格） */
const TRACK = { line: 0.2, width: 0.8, height: 0.45, pad: 1, label: 1, past: 1.05, gap: 0.6 };
/** 拍线：普通拍、小节线各多亮；判定线平时多粗、拍点上多粗（像素），拍点后多久（占一拍的比例）回到平时 */
const BEAT = { alpha: 0.28, barAlpha: 0.7, line: 4, pulse: 9, decay: 0.35 };

defineFlatMode('mania', (ctx, notes) => {
  const { scene, room, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  // 三条道只占钢琴左边那一片：不挡住骷髅王和他的钢琴
  const left = room.x, width = ctx.source.x - TRACK.gap * T - left;
  const topY = room.y, lineY = ctx.ground - TRACK.line * T, laneW = width / LANES, midX = (lane: number) => left + (lane + 0.5) * laneW;
  const y = (p: number) => Phaser.Math.Linear(topY, lineY, p);
  // 道具（原点在判定线正中）：道的竖线、键位、每条道线上一块按键时会亮的亮片
  const kit = makeKit(scene, left + width / 2, lineY, ctx.depth), rx = (x: number) => x - (left + width / 2);
  const guide = scene.add.graphics();
  guide.lineStyle(2, Colors.dim, 0.9);
  for (let i = 0; i <= LANES; i++) guide.lineBetween(rx(left + i * laneW), topY - lineY, rx(left + i * laneW), 0);
  const labels = MANIA_KEYS.map((k, i) => scene.add.text(rx(midX(i)), ctx.ground + TRACK.label * T - lineY, k.label, { fontFamily: 'monospace', fontSize: `${Math.round(T * 0.9)}px`, fontStyle: 'bold', color: '#ffd166' }).setOrigin(0.5));
  const pads = MANIA_KEYS.map((_, i) => scene.add.rectangle(rx(midX(i)), -TRACK.pad * T / 2, laneW * 0.96, TRACK.pad * T, Colors.paper));
  kit.add([guide, ...labels, ...pads]);
  const receptors = pads.map(p => new Receptor(scene, p));
  // 拍线和判定线每帧重画：拍线在落，判定线跟着拍子一粗一细
  const beats = scene.add.graphics().setDepth(ctx.depth).setVisible(false);
  const sprites = new NoteSprites(track, ctx.travelMs, TRACK.past,
    n => scene.add.rectangle(0, 0, laneW * TRACK.width, TRACK.height * T, n.holdMs ? Colors.mint : Colors.violet).setStrokeStyle(2, Colors.paper).setDepth(ctx.depth + 1),
    (o, n, p, tail, holding) => {
      // 长按：从尾巴画到头；按住的时候头停在线上，尾巴接着往下落
      const head = y(holding ? 1 : p), end = Math.min(head, y(Math.max(0, tail))), h = Math.max(TRACK.height * T, head - end);
      o.setPosition(midX(n.lane), head - h / 2 + TRACK.height * T / 2).setSize(laneW * TRACK.width, h).setOrigin(0.5);
    });
  /** 小人现在在第几条道上：一开始在他站的那条 */
  const homeLane = Phaser.Math.Clamp(Math.floor((ctx.heroX - left) / laneW), 0, LANES - 1);
  let heroLane = homeLane;

  return {
    setActive(on) { beats.setVisible(on); if (on) { tossIn(scene, kit, ctx.boss); heroLane = homeLane; } else tossOut(scene, kit); },
    update(now, press) {
      const w = ctx.config().windows;
      MANIA_KEYS.forEach((k, lane) => {
        if (!press[k.dir]) return;
        heroLane = lane;   // 跑到这条道上
        ctx.boom();   // 按一下：起跳爆炸的那一声
        const hit = track.press(now, w, n => n.lane === lane);
        receptors[lane].pulse(hit?.judgement ?? null);
        if (hit) { burst(scene, midX(lane), lineY, T * 1.2, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); if (!hit.note.holdMs) ctx.strikeBoss(midX(lane), lineY, T * 0.6, JUDGE_COLOR[hit.judgement]); }
      });
      // 长按：按到尾巴炸一下；提前松手红一下
      const holds = track.holds(now, w, n => press.held[MANIA_KEYS[n.lane].dir]);
      for (const n of holds.kept) { burst(scene, midX(n.lane), lineY, T * 1.2, JUDGE_COLOR.perfect, ctx.depth + 2); ctx.punch(); ctx.strikeBoss(midX(n.lane), lineY, T * 0.6, JUDGE_COLOR.perfect); }
      for (const n of [...holds.dropped, ...track.sweep(now, w)]) receptors[n.lane].pulse('miss');
      ctx.hero.setPosition(midX(heroLane), ctx.ground - ctx.hero.displayHeight / 2);
    },
    draw(now) {
      sprites.draw(now);
      beats.clear();
      const { ms, offsetMs } = ctx.beat, phase = (now - offsetMs) / ms;
      // 还在路上的每一拍一条横线：和音符一样的速度落下来，正好在拍点上落到判定线
      for (let k = Math.ceil(phase); offsetMs + k * ms - now <= ctx.travelMs; k++) {
        if (k < 0) continue;
        const p = 1 - (offsetMs + k * ms - now) / ctx.travelMs, bar = k % 4 === 0;
        beats.lineStyle(bar ? 3 : 1, Colors.paper, bar ? BEAT.barAlpha : BEAT.alpha);
        beats.lineBetween(left, y(p), left + width, y(p));
      }
      // 判定线：拍点上一下变粗，然后收回去
      const since = phase < 0 ? 1 : phase % 1;
      beats.lineStyle(BEAT.line + (BEAT.pulse - BEAT.line) * Math.max(0, 1 - since / BEAT.decay), Colors.gold, 1);
      beats.lineBetween(left, lineY, left + width, lineY);
    },
    destroy() { kit.destroy(); beats.destroy(); sprites.destroy(); },
  };
});
