// ===== 喵斯快跑（2D 横版）：人站在左边，方块分上下两排从右边过来，到框里时按 W / 空格（上排）、S（下排）把它打掉 =====
import { NoteTrack } from '@/rhythm';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, NoteSprites, Receptor } from './define';

/** 上排、下排在房间的多高（比例）；打击点在多靠左（比例）；人站在打击点左边几格；方块多大（格）；按上时人在上排停多久（毫秒） */
const TRACK = { topY: 0.52, bottomY: 0.72, hitX: 0.28, heroBack: 1.6, size: 0.9, upMs: 160, past: 1.08 };

defineFlatMode('dash', (ctx, notes) => {
  const { scene, room, tile: T } = ctx;
  const track = new NoteTrack(notes, ctx.score);
  const rowY = (lane: number) => room.y + room.h * (lane === 0 ? TRACK.topY : TRACK.bottomY);
  const hitX = room.x + room.w * TRACK.hitX, fromX = room.x + room.w + T, size = TRACK.size * T, box = size * 1.3;
  // 轨道：两条线 + 打击点两个框（框里有一块按键时会亮的亮片）
  const guide = scene.add.graphics().setDepth(ctx.depth).setVisible(false);
  guide.lineStyle(2, Colors.dim, 0.8);
  for (const lane of [0, 1]) guide.lineBetween(hitX, rowY(lane), room.x + room.w, rowY(lane));
  guide.lineStyle(3, Colors.gold, 1);
  for (const lane of [0, 1]) guide.strokeRect(hitX - box / 2, rowY(lane) - box / 2, box, box);
  const receptors = [0, 1].map(lane => new Receptor(scene, scene.add.rectangle(hitX, rowY(lane), box, box, Colors.paper).setDepth(ctx.depth).setVisible(false)));
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
    setActive(on) { guide.setVisible(on); receptors.forEach(r => r.setVisible(on)); if (on) ctx.hero.setFlipX(false); },
    update(now, press) {
      if (press.up || press.jump) { strike(0, now); upUntil = now + TRACK.upMs; }
      if (press.down) { strike(1, now); upUntil = 0; }
      for (const n of track.sweep(now, ctx.config().windows)) receptors[n.lane].pulse('miss');
      ctx.hero.setPosition(hitX - TRACK.heroBack * T, rowY(now < upUntil ? 0 : 1));
    },
    draw(now) { sprites.draw(now); },
    destroy() { guide.destroy(); receptors.forEach(r => r.destroy()); sprites.destroy(); },
  };
});
