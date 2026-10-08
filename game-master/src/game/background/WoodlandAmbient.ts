import Phaser from 'phaser';
import { DEPTH } from '@/game/depth';
import { MIST, MOTE_COUNT, mistOffset, moteAt, roomSeed } from './ambientMath';
import { attachWoodlandWind, type WindData } from './WoodlandWind';

interface Room { key: string; x: number; y: number; w: number; h: number }
interface AmbientRoom { room: Room; seed: number; mist: Phaser.GameObjects.TileSprite; motes: Phaser.GameObjects.Image[]; started: number; }
const MIST_KEY = 'woodland:mist', MOTE_KEY = 'woodland:mote';

function ensureTextures(textures: Phaser.Textures.TextureManager): void {
  if (!textures.exists(MIST_KEY)) {
    const size = 128, canvas = textures.createCanvas(MIST_KEY, size, size)!;
    const pixels = canvas.context.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
      // Periodic, horizontally stretched wisps; no visible tile join.
      const density = Math.pow(Math.max(0, 0.44 + 0.24 * Math.sin(v + 0.7 * Math.sin(u))
        + 0.18 * Math.sin(2 * v - u) + 0.12 * Math.sin(3 * u + v)), 2);
      const i = (y * size + x) * 4;
      pixels.data[i] = 150; pixels.data[i + 1] = 168; pixels.data[i + 2] = 157;
      pixels.data[i + 3] = Math.round(density * 255);
    }
    canvas.context.putImageData(pixels, 0, 0); canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  if (!textures.exists(MOTE_KEY)) {
    const canvas = textures.createCanvas(MOTE_KEY, 16, 16)!;
    const gradient = canvas.context.createRadialGradient(8, 8, 0, 8, 8, 8);
    gradient.addColorStop(0, 'rgba(220,228,166,1)');
    gradient.addColorStop(0.25, 'rgba(191,211,155,0.6)');
    gradient.addColorStop(1, 'rgba(169,193,143,0)');
    canvas.context.fillStyle = gradient; canvas.context.fillRect(0, 0, 16, 16); canvas.refresh();
  }
}

/** Shared, bounded ambient objects; image pixels at room boundaries never move. */
export class WoodlandAmbient {
  private readonly rooms = new Map<string, AmbientRoom>();
  private readonly winds: WindData[] = [];
  private readonly reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private seconds = 0;
  private previousTime: number | undefined;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.rooms.clear(); this.winds.length = 0; });
  }

  add(room: Room, near: Phaser.GameObjects.Image): void {
    if (this.rooms.has(room.key)) return;
    ensureTextures(this.scene.textures);
    const seed = roomSeed(room.key);
    const mist = this.scene.add.tileSprite(room.x, room.y, room.w, room.h, MIST_KEY)
      .setOrigin(0).setTileScale(MIST.scaleX, MIST.scaleY)
      .setDepth(DEPTH.background + DEPTH.backgroundStep * 1.5).setAlpha(0).setVisible(false).setName('woodland-mist');
    const motes = Array.from({ length: MOTE_COUNT }, (_, i) => this.scene.add.image(0, 0, MOTE_KEY)
      .setDisplaySize(3 + i % 2, 3 + i % 2).setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.background + DEPTH.backgroundStep * 5).setAlpha(0).setVisible(false).setName('woodland-mote'));
    this.rooms.set(room.key, { room, seed, mist, motes, started: this.seconds });
    const data: WindData = { time: 0, phase: seed * Math.PI * 2, strength: 0, w: room.w, h: room.h };
    if (attachWoodlandWind(near, data)) this.winds.push(data);
  }

  addCloud(room: Room, image: Phaser.GameObjects.Image): void {
    const data: WindData = { cloud: true, time: 0, phase: 0, strength: 0, w: room.w, h: room.h };
    if (attachWoodlandWind(image, data)) this.winds.push(data);
  }

  update(): void {
    const now = this.scene.time.now;
    const reduced = this.reduced?.matches ?? false;
    if (this.previousTime !== undefined && !reduced) this.seconds += Math.min(100, Math.max(0, now - this.previousTime)) / 1000;
    this.previousTime = now;
    const view = this.scene.cameras.main.worldView;
    for (const wind of this.winds) {
      wind.time = this.seconds;
      wind.strength = reduced ? 0 : 1;
    }
    for (const { room: r, seed, mist, motes, started } of this.rooms.values()) {
      const seen = r.x < view.right && r.x + r.w > view.x && r.y < view.bottom && r.y + r.h > view.y;
      mist.setVisible(seen);
      motes.forEach(mote => mote.setVisible(seen && !reduced));
      if (!seen) continue;
      const fade = reduced ? 1 : Math.min(1, (this.seconds - started) / 1.5);
      const offset = mistOffset(r.x, r.y, this.seconds);
      mist.setTilePosition(offset.x, offset.y).setAlpha(MIST.alpha * fade);
      if (reduced) continue;
      motes.forEach((mote, i) => {
        const at = moteAt(i, seed, this.seconds);
        mote.setPosition(r.x + at.u * r.w, r.y + at.v * r.h).setAlpha(at.alpha * fade);
      });
    }
  }
}
