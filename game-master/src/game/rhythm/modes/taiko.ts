// ===== 太鼓达人（2D）：骷髅王扔过来一面鼓，立在主角面前；红的（咚）蓝的（咔）从他的钢琴那边滚过来，滚到鼓上时红的按 A、蓝的按 D =====
// 按哪个键鼓面就变哪个颜色（红 / 蓝），不管打没打中：一眼看得出自己按的是哪边
import { NoteTrack } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, makeKit, NoteSprites, tossIn, tossOut } from './define';

/** 鼓：在人前面几格、鼓心离地多高、半径（格）；音符半径（格）；按键时鼓面亮多久（毫秒）；人往鼓那边扑多远（格）、多久收回来（毫秒） */
const TRACK = { reach: 2.2, lift: 1, drum: 0.85, radius: 0.5, faceMs: 160, lunge: 0.8, lungeMs: 110, past: 1.08 };
/** 谱面上的字符 → 颜色、按哪个方向 */
const KIND = { r: { color: Colors.rose, key: 'left' }, b: { color: Colors.sky, key: 'right' } } as const;

defineFlatMode('taiko', (ctx, notes) => {
  const { scene, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const y = ctx.ground - TRACK.lift * T, hitX = ctx.heroX + TRACK.reach * T, fromX = ctx.source.x, r = TRACK.radius * T, drumR = TRACK.drum * T;
  // 道具（原点在鼓心）：轨道一条线，鼓架两条腿，鼓面（按键时变色）
  const kit = makeKit(scene, hitX, y, ctx.depth);
  const guide = scene.add.graphics();
  guide.lineStyle(2, Colors.dim, 0.8); guide.lineBetween(0, 0, fromX - hitX, 0);
  guide.lineStyle(4, Colors.dim, 1);
  guide.lineBetween(-drumR * 0.5, drumR * 0.6, -drumR * 0.8, ctx.ground - y); guide.lineBetween(drumR * 0.5, drumR * 0.6, drumR * 0.8, ctx.ground - y);
  const face = scene.add.circle(0, 0, drumR, Colors.paper).setStrokeStyle(4, Colors.gold);
  kit.add([guide, face]);
  const sprites = new NoteSprites(track, ctx.travelMs, TRACK.past,
    n => scene.add.circle(0, 0, r, KIND[n.char as keyof typeof KIND]?.color ?? Colors.paper).setStrokeStyle(3, Colors.paper).setDepth(ctx.depth + 1),
    (o, _n, p) => { o.setPosition(fromX + (hitX - fromX) * p, y); });
  /** 上一次按键的时刻、按的是什么颜色：鼓面亮那个颜色，人往鼓那边扑一下 */
  let struckAt = -Infinity, struckColor: number = Colors.paper;

  return {
    setActive(on) { if (on) { tossIn(scene, kit, ctx.boss); ctx.hero.setFlipX(false); } else tossOut(scene, kit); },
    update(now, press) {
      const w = ctx.config().windows;
      for (const [char, k] of Object.entries(KIND)) {
        if (!press[k.key]) continue;
        struckAt = now; struckColor = k.color;
        const hit = track.press(now, w, n => n.char === char);
        if (hit) { burst(scene, hitX, y, drumR * 2, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
      }
      track.sweep(now, w);
      const since = now - struckAt;
      face.setFillStyle(since < TRACK.faceMs ? struckColor : Colors.paper);
      ctx.hero.setPosition(ctx.heroX + Math.max(0, 1 - since / TRACK.lungeMs) * TRACK.lunge * T, ctx.ground - ctx.hero.displayHeight / 2);
    },
    draw(now) { sprites.draw(now); },
    destroy() { kit.destroy(); sprites.destroy(); },
  };
});
