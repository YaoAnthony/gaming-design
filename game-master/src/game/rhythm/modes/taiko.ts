// ===== 太鼓达人（2D）：一条轨道，红的（咚）蓝的（咔）从右边过来，到圈里时红的按 A、蓝的按 D =====
import { NoteTrack } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, NoteSprites, Receptor } from './define';

/** 轨道在房间的多高（比例）、多厚（格）；打击圈在多靠左（比例）；人站在圈左边几格；音符半径（格）；按键时人往圈那边扑多远（格）、多久收回来（毫秒） */
const TRACK = { y: 0.64, band: 1.6, hitX: 0.26, heroBack: 1.8, radius: 0.5, past: 1.08, lunge: 0.9, lungeMs: 110 };
/** 谱面上的字符 → 颜色、按哪个方向 */
const KIND = { r: { color: Colors.rose, key: 'left' }, b: { color: Colors.sky, key: 'right' } } as const;

defineFlatMode('taiko', (ctx, notes) => {
  const { scene, room, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const y = room.y + room.h * TRACK.y, hitX = room.x + room.w * TRACK.hitX, fromX = room.x + room.w + T, r = TRACK.radius * T;
  // 轨道：一条深色的带子 + 打击圈（圈里有一块按键时会亮的亮片）
  const guide = scene.add.graphics().setDepth(ctx.depth).setVisible(false);
  guide.fillStyle(Colors.ink, 0.9); guide.fillRect(room.x, y - TRACK.band * T / 2, room.w, TRACK.band * T);
  guide.lineStyle(2, Colors.dim, 1); guide.strokeRect(room.x, y - TRACK.band * T / 2, room.w, TRACK.band * T);
  guide.lineStyle(3, Colors.gold, 1); guide.strokeCircle(hitX, y, r * 1.35);
  const receptor = new Receptor(scene, scene.add.circle(hitX, y, r * 1.35, Colors.paper).setDepth(ctx.depth).setVisible(false));
  const sprites = new NoteSprites(track, ctx.travelMs, TRACK.past,
    n => scene.add.circle(0, 0, r, KIND[n.char as keyof typeof KIND]?.color ?? Colors.paper).setStrokeStyle(3, Colors.paper).setDepth(ctx.depth + 1),
    (o, _n, p) => { o.setPosition(fromX + (hitX - fromX) * p, y); });
  /** 上一次按键的时刻：小人往圈那边扑一下再收回来 */
  let struckAt = -Infinity;

  return {
    setActive(on) { guide.setVisible(on); receptor.setVisible(on); if (on) ctx.hero.setFlipX(false); },
    update(now, press) {
      const w = ctx.config().windows;
      for (const [char, k] of Object.entries(KIND)) {
        if (!press[k.key]) continue;
        struckAt = now;
        const hit = track.press(now, w, n => n.char === char);
        receptor.pulse(hit?.judgement ?? null);
        if (hit) { burst(scene, hitX, y, r * 2, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
      }
      if (track.sweep(now, w).length) receptor.pulse('miss');
      const lunge = Math.max(0, 1 - (now - struckAt) / TRACK.lungeMs) * TRACK.lunge * T;
      ctx.hero.setPosition(hitX - TRACK.heroBack * T + lunge, y);
    },
    draw(now) { sprites.draw(now); },
    destroy() { guide.destroy(); receptor.destroy(); sprites.destroy(); },
  };
});
