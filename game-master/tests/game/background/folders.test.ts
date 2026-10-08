import { describe, expect, it } from 'vitest';
import { discoverBackgroundFolders } from '@/asset/backgroundFolders';
import { backgroundDef } from '@/asset/backgrounds';

describe('按文件夹自动发现背景层', () => {
  it('数字排序，1、2、10；忽略预览、原稿和根目录旧图', () => {
    const backgrounds = discoverBackgroundFolders([
      'A/10.near.png', 'A/2.middle.webp', 'A/1.png', 'A/overview.png',
      'A/work/3.png', 'cave_far.png', 'B/1.jpg',
    ], { A: { id: 'woodland-a-v1', name: '林心' } });
    expect(backgrounds[0]).toMatchObject({ id: 'woodland-a-v1', name: '林心', pixelated: true });
    expect(backgrounds[0].layers.map(layer => layer.file)).toEqual(['A/1.png', 'A/2.middle.webp', 'A/10.near.png']);
    expect(backgrounds[0].layers.every(layer => layer.parallax === 0)).toBe(true);
    expect(backgrounds[1].id).toBe('B');
  });
  it('拒绝同一文件夹里含糊的重复编号和 0 编号', () => {
    expect(() => discoverBackgroundFolders(['A/1.png', 'A/01.near.png'])).toThrow('编号重复');
    expect(() => discoverBackgroundFolders(['A/0.png'])).toThrow('正整数');
  });
});

it('第一关的 14 个旧背景 id 都解析到对应房间的四层新素材', () => {
  for (const room of 'ABCDEFGHIJKMNO') {
    const key = room.toLowerCase();
    expect(backgroundDef('woodland-' + key + '-v1').layers.map(layer => layer.file)).toEqual([
      'woodland-' + key + '/1.far.png', 'woodland-' + key + '/2.clouds.png',
      'woodland-' + key + '/3.middle.png', 'woodland-' + key + '/4.near.png',
    ]);
  }
});
