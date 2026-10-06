// ===== 背景（游戏里）：每个房间按 asset/backgrounds.ts 的背景画；默认的是程序画的渐变天空 + 星星 =====
// - 背景图不在启动清单里：进到这一层才加载（加载完之前先显示星空），换层时把这一层用不到的背景图放掉（evictBackgrounds）
// - 每个房间单独放一套图（房间之间平移时相邻两个房间各显示各的）；只有镜头看得到的房间显示
// - 视差：人在房间里走，远的层挪得少、近的挪得多（layout.ts 的 parallaxOffset）
// - 层次：都在地形、光柱、微尘下面（depth.ts 的 DEPTH.background*）；画进游戏画布，3D 屏幕和攥纸团都会带上它
import Phaser from 'phaser';
import { backgroundDef, backgroundKey, backgroundUrl, BACKGROUND_KEY_PREFIX, DEFAULT_BACKGROUND, type BackgroundLayer } from '@/asset/backgrounds';
import { Colors, hex } from '@/game/palette';
import { DEPTH } from '@/game/depth';
import type { Floor } from '@/type';
import { backgroundOf, backgroundsOfFloor, coverScale, parallaxOffset } from './layout';

/** 星空：每个房间撒几颗星（只撒在上面这么多比例里） */
const STARS = { perRoom: 14, top: 0.8 };

interface RoomRect { key: string; x: number; y: number; w: number; h: number }
interface Placed { room: RoomRect; layer: BackgroundLayer; img: Phaser.GameObjects.Image }

/** 这些背景用到的图都在贴图管理器里了就马上回调；没有的先加载（失败的跳过，那个房间退回星空），加载完回调 */
export function loadBackgrounds(scene: Phaser.Scene, ids: string[], done: () => void): void {
  const files = [...new Set(ids.flatMap(id => backgroundDef(id).layers.map(l => l.file)))];
  const missing = files.filter(f => !scene.textures.exists(backgroundKey(f)) && backgroundUrl(f));
  if (!missing.length) { done(); return; }
  missing.forEach(f => scene.load.image(backgroundKey(f), backgroundUrl(f)!));
  scene.load.once(Phaser.Loader.Events.COMPLETE, done);
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
  private destroyed = false;

  /** @param roomPx 一个房间多少像素 */
  constructor(private readonly scene: Phaser.Scene, private readonly floor: Floor, roomPx: { w: number; h: number }) {
    const m = floor.model;
    this.rooms = m.layout.flatMap((row, ry) => row.flatMap((key, rx) => (key ? [{ key, x: rx * roomPx.w, y: ry * roomPx.h, w: roomPx.w, h: roomPx.h }] : [])));
    // 先整层铺星空（图还没加载完、或者加载失败的房间就是它），用图的房间等图到了盖在上面
    const levelW = m.layout[0]?.length * roomPx.w || roomPx.w, levelH = m.layout.length * roomPx.h || roomPx.h;
    scene.add.image(0, 0, skyTexture(scene)).setOrigin(0).setDisplaySize(levelW, levelH).setDepth(DEPTH.sky);
    this.rooms.filter(r => backgroundOf(floor, m, r.key) === DEFAULT_BACKGROUND).forEach(r => {
      for (let i = 0; i < STARS.perRoom; i++) {
        scene.add.circle(r.x + Phaser.Math.Between(0, r.w), r.y + Phaser.Math.Between(0, r.h * STARS.top), Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).setDepth(DEPTH.stars);
      }
    });
    const ids = backgroundsOfFloor(floor);
    evictBackgrounds(scene.textures, ids);
    loadBackgrounds(scene, ids, () => { if (!this.destroyed) this.place(); });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.destroyed = true; });
  }

  /** 图都到了：每个用图的房间放一套 */
  private place(): void {
    const { scene, floor } = this;
    for (const room of this.rooms) {
      const def = backgroundDef(backgroundOf(floor, floor.model, room.key));
      def.layers.forEach((layer, i) => {
        const key = backgroundKey(layer.file);
        if (!scene.textures.exists(key)) return;
        const tex = scene.textures.get(key);
        tex.setFilter(def.pixelated ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        const src = tex.getSourceImage() as { width: number; height: number };
        const img = scene.add.image(room.x + room.w / 2, room.y + room.h / 2, key)
          .setScale(coverScale(src.width, src.height, room.w, room.h, layer))
          .setAlpha(layer.alpha ?? 1).setDepth(DEPTH.background + i * DEPTH.backgroundStep).setVisible(false);
        this.placed.push({ room, layer, img });
      });
    }
  }

  /**
   * 每帧：只显示镜头看得到的房间；视差按人在那个房间里的位置算（人不在那个房间——镜头正平移过去——就按人离那个房间最近的那一点算）。
   * 只是挪位置、裁边、开关可见（不用遮罩），很便宜
   */
  update(px: number, py: number): void {
    if (!this.placed.length) return;
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
