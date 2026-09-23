// ===== 加载资产，然后跳到目标场景 =====
import Phaser from 'phaser';
import { AUDIO, IMAGES, SPRITESHEETS, TILE_SIZE } from '@/asset';
import { SCENE } from '@/game/bridge';
import i18n from '@/i18n';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENE.boot); }

  preload(): void {
    // 加载条：底槽 + 进度 + 百分比，音乐文件大，不然像卡住
    const W = this.scale.width, H = this.scale.height;
    const barW = Math.min(320, W * 0.6), barH = 12, x = (W - barW) / 2, y = H / 2;
    const track = this.add.graphics();
    track.fillStyle(0x0b0b14, 1).fillRect(x - 2, y - 2, barW + 4, barH + 4);
    track.lineStyle(2, 0x9aa0b4, 0.8).strokeRect(x - 2, y - 2, barW + 4, barH + 4);
    const fill = this.add.graphics();
    const label = this.add.text(W / 2, y - 14, i18n.t('loading', { pct: 0 }), { fontSize: '14px', color: '#e6e8f0', fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }).setOrigin(0.5, 1);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      fill.clear().fillStyle(0x4cc9f0, 1).fillRect(x, y, barW * v, barH);
      label.setText(i18n.t('loading', { pct: Math.round(v * 100) }));
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => label.setText(`加载失败：${f.key}`).setColor('#ef476f'));

    SPRITESHEETS.forEach(s => this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }));
    IMAGES.forEach(i => this.load.image(i.key, i.url));
    AUDIO.forEach(a => this.load.audio(a.key, a.url));
  }

  create(): void {
    if (!this.textures.exists('fogsquare')) {
      // 迷雾擦除用的两支笔刷：硬方块（把亮格整个擦清）+ 柔光圆（往暗处晕开）
      const sq = this.textures.createCanvas('fogsquare', TILE_SIZE, TILE_SIZE)!;
      sq.context.fillStyle = '#fff'; sq.context.fillRect(0, 0, TILE_SIZE, TILE_SIZE); sq.refresh();
      const size = TILE_SIZE * 3;
      const gl = this.textures.createCanvas('fogglow', size, size)!;
      const g = gl.context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      gl.context.fillStyle = g; gl.context.fillRect(0, 0, size, size); gl.refresh();
    }
    const next = (this.game.registry.get('bootNext') as string | undefined) ?? SCENE.game;
    const data = (this.game.registry.get('bootData') as object | undefined) ?? {};
    this.scene.start(next, data);
  }
}
