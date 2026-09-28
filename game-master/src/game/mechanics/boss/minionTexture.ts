// ===== 小史莱姆的贴图：把普通怪物贴图的色相整体转一个角度，另存一张 =====
// 不用 tint：tint 是乘法，紫色的怪乘绿色只会变暗变灰；转色相能保留眼睛、高光和明暗。
import type Phaser from 'phaser';

/** 按色相转 deg 度生成（或复用）一张贴图，返回它的 key */
export function hueShiftedTexture(scene: Phaser.Scene, baseKey: string, deg: number): string {
  const key = `${baseKey}@hue${Math.round(deg)}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(baseKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = scene.textures.createCanvas(key, src.width, src.height);
  if (!canvas) return baseKey;
  const ctx = canvas.context;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const m = hueMatrix(deg);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = clamp(m[0] * r + m[1] * g + m[2] * b);
    d[i + 1] = clamp(m[3] * r + m[4] * g + m[5] * b);
    d[i + 2] = clamp(m[6] * r + m[7] * g + m[8] * b);
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
  return key;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** 标准的色相旋转矩阵（和 CSS hue-rotate 同一个公式），保持亮度 */
function hueMatrix(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}
