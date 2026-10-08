// 主线剧情的数据：剧本里的每一句两种语言都有、每段演出都有实现、标记一路走下来对得上
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';
import { chunksOf, resumeIndex } from '@/story/script';
import { GM_LINES, GM_SCRIPT, GM_THINKS } from '@/story/scripts/gm';
import { CUTSCENES } from '@/story/cutscenes';
import { STORY } from '@/story/flags';
import { ENDINGS, endingChoices, storyStage, ACT1_FLOOR } from '@/story/config';
import { MONTAGE } from '@/story/montage';
import '@/game/registry/tiles';
import { Tiles } from '@/game/registry/registry';
import world from '@/map/world.json';

/** 'story.gm.3' → 那一句；找不到是 undefined */
const lookup = (dict: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);

describe('GM 的剧本', () => {
  const keys = GM_SCRIPT.steps.flatMap(s => ('say' in s ? [s.say] : 'think' in s ? [s.think] : []));

  it('每一句中英文都有', () => {
    for (const k of keys) {
      expect(typeof lookup(zh, k), `zh ${k}`).toBe('string');
      expect(typeof lookup(en, k), `en ${k}`).toBe('string');
    }
  });

  it('台词按顺序一句不落：story.gm 每一句都用上了，「已深度思考」五句', () => {
    expect(zh.story.gm.length).toBe(GM_LINES);
    expect(en.story.gm.length).toBe(GM_LINES);
    expect(zh.story.think.length).toBe(GM_THINKS);
    const said = keys.filter(k => k.startsWith('story.gm.')).map(k => Number(k.split('.')[2]));
    expect(said).toEqual(Array.from({ length: GM_LINES }, (_, i) => i));
  });

  it('「已深度思考」1、2、4、8、16 秒，自己翻页', () => {
    const thinks = GM_SCRIPT.steps.filter(s => 'think' in s);
    expect(thinks.map(s => ('think' in s ? s.ms : 0))).toEqual([1000, 2000, 4000, 8000, 16000]);
    const lines = chunksOf(GM_SCRIPT).flatMap(c => (c.kind === 'talk' ? c.lines : []));
    expect(lines.filter(l => l.think).every(l => l.autoMs)).toBe(true);
  });

  it('演出顺序：检查庆祝画面 → 拉出编辑器 → 拖 GM → 改造；每一段都是登记过的演出', () => {
    const scenes = GM_SCRIPT.steps.flatMap(s => ('cutscene' in s ? [s.cutscene] : []));
    expect(scenes).toEqual([CUTSCENES.inspectCelebration, CUTSCENES.pullEditor, CUTSCENES.dragGM, CUTSCENES.editorMontage]);
    expect(new Set(Object.values(CUTSCENES))).toEqual(new Set(scenes));
  });

  it('揉掉「继续」之后记下 continueRemoved；说完记下 metGM、act2.editor', () => {
    const steps = GM_SCRIPT.steps;
    const at = (pred: (s: typeof steps[number]) => boolean) => steps.findIndex(pred);
    expect(at(s => 'flag' in s && s.flag === STORY.continueRemoved)).toBe(at(s => 'cutscene' in s && s.cutscene === CUTSCENES.inspectCelebration) + 1);
    expect(at(s => 'flag' in s && s.flag === STORY.act2Editor)).toBeLessThan(at(s => 'cutscene' in s && s.cutscene === CUTSCENES.editorMontage));
  });

  it('相邻的台词合成一段对话，演出和标记把它断开', () => {
    const chunks = chunksOf(GM_SCRIPT);
    expect(chunks.map(c => c.kind)).toEqual(['talk', 'cutscene', 'flag', 'talk', 'cutscene', 'talk', 'cutscene', 'flag', 'flag', 'cutscene']);
    expect(chunks[0].kind === 'talk' && chunks[0].lines.length).toBe(17);
  });

  it('中途被打断：从最后记下的标记之后接着说', () => {
    const chunks = chunksOf(GM_SCRIPT);
    expect(resumeIndex(chunks, () => false)).toBe(0);
    expect(resumeIndex(chunks, f => f === STORY.continueRemoved)).toBe(3);
    expect(resumeIndex(chunks, () => true)).toBe(chunks.length - 1);   // 只剩最后的改造演出
  });
});

describe('剧情的配置', () => {
  it('第一幕的终点是第一层：结局画面', () => {
    expect(ENDINGS[ACT1_FLOOR]).toBe('act1');
    expect(world.floors[0].id).toBe(ACT1_FLOOR);
  });

  it('「继续」被扔掉之后结局画面只剩重新开始 / 退出', () => {
    expect(endingChoices({})).toEqual(['continue', 'restart', 'quit']);
    expect(endingChoices({ [STORY.continueRemoved]: true })).toEqual(['restart', 'quit']);
  });

  it('走到哪一步', () => {
    expect(storyStage({})).toBe('act1');
    expect(storyStage({ [STORY.act1Continued]: true })).toBe('act1');
    expect(storyStage({ [STORY.act1Continued]: true, [STORY.act2Editor]: true })).toBe('editor');
  });

  it('编辑器改造画的都是注册过的砖、都在房间里', () => {
    for (const s of MONTAGE) {
      expect(Tiles.has(s.tile), s.tile).toBe(true);
      for (const [x, y] of s.cells) { expect(x >= 1 && x <= 28 && y >= 1 && y <= 18, `${x},${y}`).toBe(true); }
    }
  });
});

describe('第一层地图里的剧情', () => {
  const m = world.floors[0].model as unknown as { layout: (string | null)[][]; rooms: Record<string, string[]>; entities: Record<string, string[]> };
  const where = (ch: string) => Object.entries(m.entities).flatMap(([k, rows]) => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [{ k, x, y }] : []))));

  it('GM 只有一个，在房间 P（城堡前面）', () => {
    expect(where('g')).toEqual([expect.objectContaining({ k: 'P' })]);
  });

  it('GM 房间已有地形会跳过，每笔改造仍有空格可画', () => {
    const [{ k }] = where('g');
    // Gm.montageCells / paintable 会保留已有砖；地图不必为演出清空地形。
    for (const stroke of MONTAGE) expect(stroke.cells.some(([x, y]) => m.rooms[k][y][x] === '.'), stroke.tile).toBe(true);
  });
});
