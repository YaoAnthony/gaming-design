import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';
import i18n, { mapText, tr } from '@/i18n';

/** 所有叶子 key，比如 msg.fuseLit、dialogue.skeleton.0 */
function keys(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n', () => {
  it('默认英文', () => {
    expect(i18n.language).toBe('en');
  });

  it('中英文案的 key 一致（map.* 只有中文需要）', () => {
    const zhKeys = keys(zh).filter(k => !k.startsWith('map.'));
    expect(zhKeys.sort()).toEqual(keys(en).sort());
  });

  it('tr 能取到台词数组里的一句，不是 key 的文字原样返回', async () => {
    expect(tr('dialogue.skeleton.0')).toBe(en.dialogue.skeleton[0]);
    expect(tr('msg.speedUp', { n: 3 })).toBe('Speed up! Bombs ×3');
    expect(tr('随便一句')).toBe('随便一句');
    await i18n.changeLanguage('zh');
    expect(tr('dialogue.skeleton.0')).toBe(zh.dialogue.skeleton[0]);
    expect(mapText('Dungeon')).toBe('地下城');
    expect(mapText('Somewhere')).toBe('Somewhere');
    await i18n.changeLanguage('en');
    expect(mapText('Dungeon')).toBe('Dungeon');
  });
});
