// ===== 加载资产，然后跳到目标场景 =====
import Phaser from 'phaser';
import { setAudioOutput } from '@/audio/synth';
import { AUDIO, IMAGES, SPRITESHEETS, TILE_SIZE } from '@/asset';
import { SCENE } from '@/game/scenes/keys';
import i18n from '@/i18n';
import { FogOfWar } from '@/game/fog/Fog';
import { buildWallTexture } from '@/game/terrain/walls';
import { Colors, hex } from '@/game/palette';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENE.boot); }

  preload(): void {
    // 加载条：底槽 + 进度 + 百分比，音乐文件大，不然像卡住
    const W = this.scale.width, H = this.scale.height;
    const barW = Math.min(320, W * 0.6), barH = 12, x = (W - barW) / 2, y = H / 2;
    const track = this.add.graphics();
    track.fillStyle(Colors.ink, 1).fillRect(x - 2, y - 2, barW + 4, barH + 4);
    track.lineStyle(2, Colors.muted, 0.8).strokeRect(x - 2, y - 2, barW + 4, barH + 4);
    const fill = this.add.graphics();
    const label = this.add.text(W / 2, y - 14, i18n.t('loading', { pct: 0 }), { fontSize: '14px', color: hex(Colors.text), fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }).setOrigin(0.5, 1);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      fill.clear().fillStyle(Colors.sky, 1).fillRect(x, y, barW * v, barH);
      label.setText(i18n.t('loading', { pct: Math.round(v * 100) }));
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => label.setText(i18n.t('loadFailed', { key: f.key })).setColor(hex(Colors.rose)));

    SPRITESHEETS.forEach(s => this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }));
    IMAGES.forEach(i => this.load.image(i.key, i.url));
    // 背景曲（标了 music 的）很大，不在这里等：Music 第一次要放时才下载，加载条只等音效
    AUDIO.filter(a => !a.music).forEach(a => this.load.audio(a.key, a.url));
  }

  create(): void {
    // 现场合成的音效（打击音、Boss 的「滴」、捏纸团……）接到 Phaser 的总线上：跟着游戏的静音和总音量走
    const mgr = this.sound as Partial<{ context: AudioContext; destination: AudioNode; masterMuteNode: AudioNode }>;
    const out = mgr.destination ?? mgr.masterMuteNode ?? mgr.context?.destination;
    if (mgr.context && out) setAudioOutput(mgr.context, out);
    FogOfWar.createTextures(this.textures, TILE_SIZE);   // 迷雾的笔刷
    buildWallTexture(this.textures, TILE_SIZE);          // 墙：按手画模板拼好各种邻居组合
    const next = (this.game.registry.get('bootNext') as string | undefined) ?? SCENE.game;
    const data = (this.game.registry.get('bootData') as object | undefined) ?? {};
    this.scene.start(next, data);
  }
}
