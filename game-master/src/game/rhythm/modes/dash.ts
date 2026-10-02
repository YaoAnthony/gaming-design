// ===== 喵斯快跑（2D 横版）：主角站在左边，方块分上下两排从右边骷髅王的钢琴那边过来，到框里时按 W / 空格（上排）、S（下排）把它打掉 =====
import { NoteTrack } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, makeKit, NoteSprites, Receptor, tossIn, tossOut } from './define';

/** 下排、上排的中心离地多高（格）；打击点在人前面几格；方块多大（格）；按上时人在上排停多久（毫秒） */
const TRACK = { bottom: 0.5, top: 3.1, reach: 1.8, size: 0.9, upMs: 160, past: 1.08 };

defineFlatMode('dash', (ctx, notes) => {
  const { scene, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const rowY = (lane: number) => ctx.ground - (lane === 0 ? TRACK.top : TRACK.bottom) * T;
  const hitX = ctx.heroX + TRACK.reach * T, fromX = ctx.source.x, size = TRACK.size * T, box = size * 1.3;
  // 道具（原点在下排的打击点）：两条轨道 + 两个打击框（框里有一块按键时会亮的亮片）
  const kit = makeKit(scene, hitX, rowY(1), ctx.depth), dy = (lane: number) => rowY(lane) - rowY(1);
  const guide = scene.add.graphics();
  guide.lineStyle(2, Colors.dim, 0.8);
  for (const lane of [0, 1]) guide.lineBetween(0, dy(lane), fromX - hitX, dy(lane));
  guide.lineStyle(3, Colors.gold, 1);
  for (const lane of [0, 1]) guide.strokeRect(-box / 2, dy(lane) - box / 2, box, box);
  const pads = [0, 1].map(lane => scene.add.rectangle(0, dy(lane), box, box, Colors.paper));
  kit.add([guide, ...pads]);
  const receptors = pads.map(p => new Receptor(scene, p));
  const sprites = new NoteSprites(track, ctx.travelMs, TRACK.past,
    n => scene.add.rectangle(0, 0, size, size, n.lane === 0 ? Colors.sky : Colors.mint).setStrokeStyle(2, Colors.ink).setDepth(ctx.depth + 1),
    (o, n, p) => { o.setPosition(fromX + (hitX - fromX) * p, rowY(n.lane)); });
  /** 人这会儿在上排（刚按了上） */
  let upUntil = 0;
  const strike = (lane: number, now: number) => {
    const hit = track.press(now, ctx.config().windows, n => n.lane === lane);
    receptors[lane].pulse(hit?.judgement ?? null);
    if (hit) { burst(scene, hitX, rowY(lane), size, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch(); }
  };

  return {
    setActive(on) { if (on) { tossIn(scene, kit, ctx.boss); ctx.hero.setFlipX(false); } else tossOut(scene, kit); },
    update(now, press) {
      if (press.up || press.jump) { strike(0, now); upUntil = now + TRACK.upMs; }
      if (press.down) { strike(1, now); upUntil = 0; }
      for (const n of track.sweep(now, ctx.config().windows)) receptors[n.lane].pulse('miss');
      // 人平时站在地上（下排），按上跳到上排去打
      ctx.hero.setPosition(ctx.heroX, now < upUntil ? rowY(0) : ctx.ground - ctx.hero.displayHeight / 2);
    },
    draw(now) { sprites.draw(now); },
    destroy() { kit.destroy(); sprites.destroy(); },
  };
});
