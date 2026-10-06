// ===== 喵斯快跑（2D 横版，重力翻转）：方块分上下两排从右边 Game Master 的钢琴那边过来。只用空格：按一下重力翻一次，=====
// 人在地上（下排）和天花板（上排）之间飘过去（带一声起跳爆炸）。方块到跟前时人在它那一排就接住，接住的弹回去砸 Game Master。
import Phaser from 'phaser';
import { NoteTrack } from '@/rhythm';
import { TILE_FRAMES } from '@/asset';
import { Colors } from '@/game/palette';
import { burst, defineFlatMode, JUDGE_COLOR, makeKit, NoteSprites, Receptor, tossIn, tossOut } from './define';

/** 下排、上排的中心离地多高（格）；接的位置在人前面几格（0 = 就在人身上）；方块多大（格）；方块过了接的位置还画多远 */
const TRACK = { bottom: 0.5, top: 3.1, reach: 0, size: 0.9, past: 1.08 };   // reach 0：方块一直飞到人身上，碰到就算接住
/** 重力翻一次人飘多久（毫秒） */
const FLIP = { ms: 150 };
/** 天花板的石砖：几块（以人为中心排开）；一块接一块隔多久冒出来、一块冒多久（毫秒） */
const CEILING = { bricks: 5, everyMs: 35, popMs: 110 };

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
  // 天花板：一排石砖（和关卡里的岩石同一张图），重力翻上去之后人倒着站在它下面。不跟着道具扔过来，轮到时一块块迅速冒出来
  const ceilY = rowY(0) - ctx.hero.displayHeight / 2 - T / 2;
  const bricks = Array.from({ length: CEILING.bricks }, (_, i) =>
    scene.add.image(ctx.heroX + (i - (CEILING.bricks - 1) / 2) * T, ceilY, 'tiles', TILE_FRAMES.rock).setDisplaySize(T, T).setDepth(ctx.depth).setVisible(false));
  const showCeiling = (on: boolean) => bricks.forEach((b, i) => {
    scene.tweens.killTweensOf(b);
    if (!on) { b.setVisible(false); return; }
    b.setVisible(true).setScale(0);
    scene.tweens.add({ targets: b, displayWidth: T, displayHeight: T, delay: i * CEILING.everyMs, duration: CEILING.popMs, ease: 'Back.easeOut' });
  });
  /** 重力朝哪：1 = 朝下（人在地上，下排），0 = 朝上（人倒站在天花板下，上排）；上一次翻是曲子的第几毫秒 */
  let row = 1, flipAt = -Infinity;
  const floorY = ctx.ground - ctx.hero.displayHeight / 2;

  return {
    setActive(on) {
      row = 1; flipAt = -Infinity;
      ctx.hero.setFlipY(false).setAngle(0);
      showCeiling(on);
      if (on) { tossIn(scene, kit, ctx.boss); ctx.hero.setFlipX(false); } else tossOut(scene, kit);
    },
    update(now, press) {
      // 空格：重力翻一下（和平时起跳一样的那一声爆炸）。人是飘过去的，不是瞬移
      if (press.jump) { row = 1 - row; flipAt = now; ctx.boom(); }
      const k = Phaser.Math.Clamp((now - flipAt) / FLIP.ms, 0, 1), e = k * k * (3 - 2 * k);
      const toY = row === 0 ? rowY(0) : floorY, fromY = row === 0 ? floorY : rowY(0);
      ctx.hero.setPosition(ctx.heroX, Phaser.Math.Linear(fromY, toY, e)).setFlipY(row === 0 ? e > 0.5 : e <= 0.5);
      // 接：不用另外按键。方块到跟前时人在它那一排（飘过半程就算到了）就接住；来晚一点是 Good，再晚就漏了
      const at = k > 0.5 ? row : 1 - row, w = ctx.config().windows;
      const hit = track.press(now, w, n => n.lane === at && now >= n.timeMs);
      if (hit) {
        receptors[at].pulse(hit.judgement);
        burst(scene, hitX, rowY(at), size, JUDGE_COLOR[hit.judgement], ctx.depth + 2); ctx.punch();
        ctx.strikeBoss(hitX, rowY(at), size, at === 0 ? Colors.sky : Colors.mint);
      }
      for (const n of track.sweep(now, w)) receptors[n.lane].pulse('miss');
    },
    draw(now) { sprites.draw(now); },
    destroy() { ctx.hero.setFlipY(false).setAngle(0); bricks.forEach(b => { scene.tweens.killTweensOf(b); b.destroy(); }); kit.destroy(); sprites.destroy(); },
  };
});
