import type { BackgroundDef } from './backgrounds';

export interface BackgroundFolderOptions {
  id?: string;
  name?: string;
  pixelated?: boolean;
  ambient?: 'woodland';
}

/** 数字是从远到近的堆叠顺序；说明图、原稿等非数字文件不进入游戏。 */
export function discoverBackgroundFolders(
  files: readonly string[], options: Record<string, BackgroundFolderOptions> = {},
): BackgroundDef[] {
  const folders = new Map<string, { file: string; order: number }[]>();
  for (const file of files) {
    const match = /^([^/]+)\/(\d+)(?:[._-][^/]*)?\.(?:png|webp|jpe?g)$/i.exec(file);
    if (!match) continue;
    const [, folder, index] = match;
    const layers = folders.get(folder) ?? [];
    const order = Number(index);
    if (!Number.isSafeInteger(order) || order < 1) throw new Error('背景层编号必须是正整数: ' + file);
    if (layers.some(layer => layer.order === order)) throw new Error('背景层编号重复: ' + file);
    layers.push({ file, order });
    folders.set(folder, layers);
  }
  return [...folders].sort(([a], [b]) => a.localeCompare(b)).map(([folder, layers]) => ({
    id: options[folder]?.id ?? folder,
    name: options[folder]?.name ?? folder,
    pixelated: options[folder]?.pixelated ?? true,
    ambient: options[folder]?.ambient,
    // 已拼接的房间默认不平移，避免重新错开四边的接缝。
    layers: layers.sort((a, b) => a.order - b.order).map(({ file }) => ({ file, parallax: 0, ...(/[._-]clouds\./i.test(file) ? { motion: 'cloud' as const } : {}) })),
  }));
}
