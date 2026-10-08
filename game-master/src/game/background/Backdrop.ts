// ===== 背景（游戏里）：每个房间按 asset/backgrounds.ts 的背景画；默认的是程序画的渐变天空 + 星星 =====
// - 背景图不在启动清单里：开场所在房间的图在进这一层之前（GameScene.preload）就下好，进去第一帧就是对的；
//   这一层别的房间的图进来以后在后台接着下，到一张就淡入一张（图到之前那个房间垫深色，不露出默认的蓝色天空）；
//   换层时把这一层用不到的背景图放掉（evictBackgrounds）
// - 每个房间单独放一套图（房间之间平移时相邻两个房间各显示各的）；只有镜头看得到的房间显示
// - 视差：人在房间里走，远的层挪得少、近的挪得多（layout.ts 的 parallaxOffset）
// - 层次：都在地形、光柱、微尘下面（depth.ts 的 DEPTH.background*）；画进游戏画布，3D 屏幕和攥纸团都会带上它
import Phaser from 'phaser';
import { WoodlandAmbient } from './WoodlandAmbient';
import { backgroundDef, backgroundKey, backgroundUrl, BACKGROUND_KEY_PREFIX, DEFAULT_BACKGROUND, type BackgroundLayer } from '@/asset/backgrounds';
import { Colors, hex } from '@/shared/palette';
import { DEPTH } from '@/game/depth';
import type { Floor } from '@/type';
import { backgroundOf, backgroundsOfFloor, coverScale, parallaxOffset } from './layout';

/** 星空：每个房间撒几颗星（只撒在上面这么多比例里） */
const STARS = { perRoom: 14, top: 0.8 };
/** 进场以后才下好的图淡入多久（毫秒） */
const FADE_IN_MS = 350;

interface RoomRect { key: string; x: number; y: number; w: number; h: number }
interface Placed { room: RoomRect; layer: BackgroundLayer; img: Phaser.GameObjects.Image }

/** 把这些背景还没加载的图排进加载队列（不开始下）；返回排了几张。场景的 preload 里用：Phaser 下完才调 create */
export function queueBackgrounds(scene: Phaser.Scene, ids: string[]): number {
  const files = [...new Set(ids.flatMap(id => backgroundDef(id).layers.map(l => l.file)))];
  const missing = files.filter(f => !scene.textures.exists(backgroundKey(f)) && backgroundUrl(f));
  missing.forEach(f => scene.load.image(backgroundKey(f), backgroundUrl(f)!));
  return missing.length;
}

/**
 * 这些背景用到的图都在贴图管理器里了就马上回调；没有的先加载（失败的跳过，那个房间退回星空），全部下完回调 done。
 * each = 每下好一张就调一次（可以到一张放一张）
 */
export function loadBackgrounds(scene: Phaser.Scene, ids: string[], done: () => void, each?: () => void): void {
  if (!queueBackgrounds(scene, ids)) { done(); return; }
  const onFile = () => each?.();
  if (each) scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, onFile);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => { scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onFile); done(); });
  scene.load.start();
}

/** 把用不到的背景图从贴图管理器里删掉（换层后调：背景图大，不删的话每去一层就多占一份显存） */
export function evictBackgrounds(textures: Phaser.Textures.TextureManager, keepIds: string[]): void {
  const keep = new Set(keepIds.flatMap(id => backgroundDef(id).layers.map(l => backgroundKey(l.file))));
  textures.getTextureKeys().forEach(k => { if (k.startsWith(BACKGROUND_KEY_PREFIX) && !keep.has(k)) textures.remove(k); });
}

/** 程序画的渐变天空贴图（一竖条，拉伸到整个房间） */
function skyTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists('sky')) {
    const c = scene.textures.createCanvas('sky', 4, 256)!;
    const ctx = c.context, grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#5b7fb5'); grd.addColorStop(0.4, '#23305a'); grd.addColorStop(1, hex(Colors.ink));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, 256); c.refresh();
  }
  return 'sky';
}

export class Backdrop {
  private readonly rooms: RoomRect[];
  private placed: Placed[] = [];
  /** 已经放上去的（房间 key + 第几层），到一张放一张时不重复放 */
  private placedKeys = new Set<string>();
  private destroyed = false;
  private readonly ambient: WoodlandAmbient;

  /** @param roomPx 一个房间多少像素 */
  constructor(private readonly scene: Phaser.Scene, private readonly floor: Floor, roomPx: { w: number; h: number }) {
    this.ambient = new WoodlandAmbient(scene);
    const m = floor.model;
    this.rooms = m.layout.flatMap((row, ry) => row.flatMap((key, rx) => (key ? [{ key, x: rx * roomPx.w, y: ry * roomPx.h, w: roomPx.w, h: roomPx.h }] : [])));
    // 先整层铺星空（图还没加载完、或者加载失败的房间就是它），用图的房间等图到了盖在上面
    const levelW = m.layout[0]?.length * roomPx.w || roomPx.w, levelH = m.layout.length * roomPx.h || roomPx.h;
    scene.add.image(0, 0, skyTexture(scene)).setOrigin(0).setDisplaySize(levelW, levelH).setDepth(DEPTH.sky);
    this.rooms.forEach(r => {
      if (backgroundOf(floor, m, r.key) !== DEFAULT_BACKGROUND) {   // 用图的房间：图到之前垫深色（不露出蓝色天空），图到了淡入盖在上面
        scene.add.rectangle(r.x, r.y, r.w, r.h, Colors.ink).setOrigin(0).setDepth(DEPTH.sky + 0.01);
        return;
      }
      for (let i = 0; i < STARS.perRoom; i++) {
        scene.add.circle(r.x + Phaser.Math.Between(0, r.w), r.y + Phaser.Math.Between(0, r.h * STARS.top), Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).setDepth(DEPTH.stars);
      }
    });
    const ids = backgroundsOfFloor(floor);
    evictBackgrounds(scene.textures, ids);
    this.place(false);   // 已经下好的（开场所在的房间，GameScene.preload 下的）直接放上去
    const more = () => { if (!this.destroyed) this.place(true); };
    loadBackgrounds(scene, ids, more, more);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.destroyed = true; });
  }

  /** 每个用图的房间：图已经下好、还没放的那几层放上去；fade = 淡入（进场以后才下好的） */
  private place(fade: boolean): void {
    const { scene, floor } = this;
    for (const room of this.rooms) {
      const def = backgroundDef(backgroundOf(floor, floor.model, room.key));
      // 透明层必须和底图一起出现，避免下载顺序造成半棵树或黑色空洞。
      if (!def.layers.every(layer => scene.textures.exists(backgroundKey(layer.file)))) continue;
      def.layers.forEach((layer, i) => {
        const key = backgroundKey(layer.file), id = `${room.key}|${i}`;
        if (this.placedKeys.has(id) || !scene.textures.exists(key)) return;
        this.placedKeys.add(id);
        const tex = scene.textures.get(key);
        tex.setFilter(def.pixelated ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        const src = tex.getSourceImage() as { width: number; height: number };
        const alpha = layer.alpha ?? 1;
        const img = scene.add.image(room.x + room.w / 2, room.y + room.h / 2, key)
          .setScale(coverScale(src.width, src.height, room.w, room.h, layer))
          .setAlpha(fade ? 0 : alpha).setDepth(DEPTH.background + i * DEPTH.backgroundStep).setVisible(false);
        if (fade) scene.tweens.add({ targets: img, alpha, duration: FADE_IN_MS, ease: 'Sine.easeOut' });
        this.placed.push({ room, layer, img });
        if (def.ambient === 'woodland' && layer.motion === 'cloud') this.ambient.addCloud(room, img);
        if (def.ambient === 'woodland' && i === def.layers.length - 1) this.ambient.add(room, img);
      });
    }
  }

  /**
   * 每帧：只显示镜头看得到的房间；视差按人在那个房间里的位置算（人不在那个房间——镜头正平移过去——就按人离那个房间最近的那一点算）。
   * 只是挪位置、裁边、开关可见（不用遮罩），很便宜
   */
  update(px: number, py: number): void {
    if (!this.placed.length) return;
    this.ambient.update();
    const view = this.scene.cameras.main.worldView;
    for (const p of this.placed) {
      const r = p.room, seen = r.x < view.right && r.x + r.w > view.x && r.y < view.bottom && r.y + r.h > view.y;
      p.img.setVisible(seen);
      if (!seen) continue;
      const { dx, dy } = parallaxOffset((px - r.x) / r.w, (py - r.y) / r.h, p.layer);
      const img = p.img.setPosition(r.x + r.w / 2 + dx, r.y + r.h / 2 + dy);
      // 图比房间大（视差留的边）：裁到只剩房间那一块，平移时不会盖到隔壁房间上
      const s = img.scaleX, left = img.x - img.displayWidth / 2, top = img.y - img.displayHeight / 2;
      img.setCrop((r.x - left) / s, (r.y - top) / s, r.w / s, r.h / s);
    }
  }
}
