// ===== 画面效果：暖光、光束、四周暗角、空气里飘的微尘（墙的投影、体积感在 Terrain） =====
// 每样都能在 config.sceneFx 里单独关掉。
import Phaser from 'phaser';
import { DEPTH } from '@/game/depth';

/** 暗角：Phaser 的暗角滤镜超出半径就全黑，半径放大到比对角线还大，四角只暗两成多、四边中点一成不到 */
const VIGNETTE = { radius: 1, strength: 0.3 };
/** 微尘：一个房间里大约同时飘多少粒、每粒活多久（毫秒）、最亮多亮、颜色 */
const DUST = { perRoom: 36, lifeMs: [6000, 10000] as const, alpha: 0.35, tint: [0xcfe3ff, 0xfff1d6] };
/**
 * 暖光：蜡烛、引线头周围一小圈淡淡的暖光，叠加混合（贴着它的墙和背景稍微变亮、带点暖色），轻轻摇曳。
 * radius = 光圈半径（格），flicker = 亮度晃动的幅度，speed = 晃得多快
 */
const LIGHTS = {
  candle: { radius: 1.8, color: 0xffb45a, alpha: 0.16, flicker: 0.1, speed: 1 },
  ember: { radius: 1.1, color: 0xff8a3d, alpha: 0.13, flicker: 0.12, speed: 1.5 },
  /** 地上的胶带：一小圈金光 */
  tape: { radius: 1.4, color: 0xffd54a, alpha: 0.2, flicker: 0.05, speed: 0.7 },
};
export type LightKind = keyof typeof LIGHTS;
/** 光束：每个亮着的房间几道，从房顶往右下斜照（画在地形后面，只在空旷处看得见，被墙挡住）；位置按房间编号定死 */
const SHAFTS = { count: [2, 3] as const, angleDeg: [18, 26] as const, width: [1, 2.2] as const, alpha: [0.06, 0.11] as const, tint: 0xfff1d0 };
/** 暖光 / 光束贴图的大小（像素） */
const LIGHT_TEX = 128, SHAFT_TEX = { w: 48, h: 256 };

export interface SceneFx {
  /** 换房间：微尘只在当前房间里飘 */
  setRoom(x: number, y: number, w: number, h: number): void;
  /** 在 (x, y) 放一盏暖光；关掉了返回 null。返回的图片由调用方挪动、销毁 */
  light(x: number, y: number, kind: LightKind): Phaser.GameObjects.Image | null;
}

export interface SceneFxRoom { x: number; y: number; w: number; h: number; key: string; dark: boolean }

/** 暖光的圆和光束的条：程序画的渐变，只建一次 */
function ensureTextures(textures: Phaser.Textures.TextureManager): void {
  if (!textures.exists('warmlight')) {
    const t = textures.createCanvas('warmlight', LIGHT_TEX, LIGHT_TEX)!, c = LIGHT_TEX / 2;
    const g = t.context.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    t.context.fillStyle = g; t.context.fillRect(0, 0, LIGHT_TEX, LIGHT_TEX); t.refresh();
  }
  if (!textures.exists('lightshaft')) {
    // 横向中间亮、两边柔；纵向顶上一小段渐亮，往下越来越淡
    const { w, h } = SHAFT_TEX, t = textures.createCanvas('lightshaft', w, h)!, img = t.context.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const across = Math.exp(-(((x - w / 2) / (w * 0.22)) ** 2));
      const along = Math.min(1, y / 16) * (1 - y / h) ** 1.3;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * across * along);
    }
    t.context.putImageData(img, 0, 0); t.refresh();
  }
}

/** 按房间编号定死的随机数（每次进来光束都在同样的地方） */
function seeded(key: string): () => number {
  let a = 2166136261;
  for (const ch of key) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, [a, b]: readonly [number, number]) => a + (b - a) * r();

export function applySceneFx(scene: Phaser.Scene, on: { vignette: boolean; dust: boolean; lights: boolean; shafts: boolean }, rooms: SceneFxRoom[], tile: number): SceneFx {
  ensureTextures(scene.textures);
  const cam = scene.cameras.main;
  if (on.vignette) cam.postFX?.addVignette(0.5, 0.5, VIGNETTE.radius, VIGNETTE.strength);   // 只有 WebGL 有 postFX

  const zone = new Phaser.Geom.Rectangle(0, 0, cam.width, cam.height);
  if (on.dust) {
    const life = (DUST.lifeMs[0] + DUST.lifeMs[1]) / 2;
    // 柔光圆缩得很小当尘点，叠加发光；慢慢往上、左右晃着飘，出生和消失时渐隐（透明度按寿命走一个正弦）
    scene.add.particles(0, 0, 'fogglow', {
      emitZone: { type: 'random', source: zone } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
      lifespan: { min: DUST.lifeMs[0], max: DUST.lifeMs[1] },
      frequency: life / DUST.perRoom,
      speedX: { min: -5, max: 5 }, speedY: { min: -9, max: -2 },
      scale: { min: 0.03, max: 0.07 },
      tint: DUST.tint,
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * DUST.alpha },
      blendMode: 'ADD',
    }).setDepth(DEPTH.dust);
  }

  if (on.shafts) {
    for (const room of rooms) {
      if (room.dark) continue;   // 全屋暗的房间没有天光
      const rand = seeded(room.key), n = Math.round(between(rand, SHAFTS.count));
      for (let i = 0; i < n; i++) {
        const angle = between(rand, SHAFTS.angleDeg) * Math.PI / 180;
        // 从房间左边六成里起，往右下斜照，照到房间底部为止（不伸到下面、右边的房间）
        const x = room.x + room.w * (0.08 + 0.55 * (i + rand()) / n), alpha = between(rand, SHAFTS.alpha);
        const shaft = scene.add.image(x, room.y, 'lightshaft').setOrigin(0.5, 0).setRotation(-angle)
          .setScale(between(rand, SHAFTS.width), room.h / Math.cos(angle) * 0.95 / SHAFT_TEX.h)
          .setTint(SHAFTS.tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha).setDepth(DEPTH.shafts);
        // 慢慢呼吸、轻轻摆
        scene.tweens.add({ targets: shaft, alpha: alpha * 0.5, duration: between(rand, [3500, 6000]), delay: rand() * 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        scene.tweens.add({ targets: shaft, x: x + 6, duration: between(rand, [7000, 9000]), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
  }

  // 暖光：每帧按几个不同频率的正弦叠起来晃亮度和大小，各盏相位不同，不会整齐划一地闪
  const lights = new Set<{ img: Phaser.GameObjects.Image; alpha: number; scale: number; amp: number; speed: number; phase: number }>();
  const flicker = (time: number) => {
    const t = time / 1000;
    lights.forEach(l => {
      if (!l.img.active) { lights.delete(l); return; }
      const w = 0.6 * Math.sin(t * 7.3 * l.speed + l.phase) + 0.4 * Math.sin(t * 13.1 * l.speed + l.phase * 2.3);
      l.img.setAlpha(l.alpha * (1 + l.amp * w)).setScale(l.scale * (1 + l.amp * 0.25 * Math.sin(t * 5.1 * l.speed + l.phase)));
    });
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, flicker);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, flicker); lights.clear(); });

  return {
    setRoom(x, y, w, h) { zone.setTo(x, y, w, h); },
    light(x, y, kind) {
      if (!on.lights) return null;
      const k = LIGHTS[kind], scale = k.radius * 2 * tile / LIGHT_TEX;
      const img = scene.add.image(x, y, 'warmlight').setTint(k.color).setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(k.alpha).setScale(scale).setDepth(DEPTH.warmLight);
      lights.add({ img, alpha: k.alpha, scale, amp: k.flicker, speed: k.speed, phase: Math.random() * 100 });
      return img;
    },
  };
}
