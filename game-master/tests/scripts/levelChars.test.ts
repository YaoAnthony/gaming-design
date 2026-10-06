// 文字关卡的脚本（scripts/levelFormat.mjs，纯 Node、引用不了 TS 的注册表）里手抄了几张字符表（第一次跑就查出脚本漏了音量滑块 V，还把王之炸药 E 当成了不挡人、不能放移动方块）：
// 这里拿注册表核对，加了新砖块 / 物件、改了砖块的能力，忘了改脚本会在这里报出来
import { describe, expect, it } from 'vitest';
import '@/game/registry/tiles';
import '@/game/mechanics';
import { Entities, Tiles } from '@/game/registry/registry';
import { canCarry } from '@/game/mechanics/mover/kinds';
// @ts-expect-error 纯 JS 的脚本模块，没有类型
import { ENTITIES, MOVABLE, SOLID, TILES } from '../../scripts/levelFormat.mjs';

const sorted = (s: Iterable<string>) => [...s].sort();
/** 文字关卡只做平台层：吃豆人层的物件不支持 */
const notInTextLevels = (e: { mechanic?: string | null }) => e.mechanic === 'pacman';
/** 文字关卡里能写的砖块字符 */
const inText = (id: string) => (TILES as Set<string>).has(id);

describe('文字关卡脚本里的字符表和注册表一致', () => {
  it('砖块：脚本认的都注册过；编辑器物品栏里有的砖块，脚本也都认', () => {
    for (const ch of TILES as Set<string>) expect(Tiles.has(ch), ch).toBe(true);
    for (const d of Tiles.filter(t => t.editorVisible)) expect((TILES as Set<string>).has(d.id), d.id + ' ' + d.name).toBe(true);
  });

  it('物件：脚本认的都注册过；注册的物件要么脚本认，要么写明文字关卡不支持', () => {
    for (const ch of ENTITIES as Set<string>) expect(Entities.has(ch), ch).toBe(true);
    for (const e of Entities.list()) expect((ENTITIES as Set<string>).has(e.id) || notInTextLevels(e), e.id + ' ' + e.name).toBe(true);
  });

  it('移动方块能画在哪些砖上、哪些砖挡人：和砖块的能力一致', () => {
    expect(sorted(MOVABLE as Set<string>)).toEqual(sorted(Tiles.filter(t => inText(t.id) && canCarry(t.id)).map(t => t.id)));
    expect(sorted(SOLID as Set<string>)).toEqual(sorted(Tiles.filter(t => inText(t.id) && t.solid && !t.oneWay).map(t => t.id)));
  });
});
