// 每种节奏玩法都要齐：在它那个世界里有实现、底下有按键提示、两种语言都有提示和喊话的文案、谱面录制知道它用哪些键。
// 加新玩法漏了哪一样，这里会报出来（不然要到游戏里换到那一段才发现）
import { describe, expect, it } from 'vitest';
import { RHYTHM_MODES, type ModeId } from '@/rhythm/modes';
import { CHARTS } from '@/rhythm/charts';
import { hasFlatMode } from '@/game/mechanics/rhythm/modes/define';
import '@/game/mechanics/rhythm/modes';
import { hasRhythmMode } from '@/world3d/rhythm/modes/define';
import '@/world3d/rhythm/modes';
import { MODE_KEYS } from '@/ui/lab/modeKeys';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';

const MODES = Object.keys(RHYTHM_MODES) as ModeId[];
const LANGS = { en, zh } as const;

describe('每种节奏玩法都齐了', () => {
  it.each(MODES)('%s：在它那个世界里注册了实现', id => {
    const realm = RHYTHM_MODES[id].realm;
    expect(realm === 'flat' ? hasFlatMode(id) : hasRhythmMode(id)).toBe(true);
  });

  it.each(MODES)('%s：有按键提示，两种语言都有提示、喊话、名字', id => {
    const spec = RHYTHM_MODES[id];
    expect(spec.hints.length).toBeGreaterThan(0);
    for (const [lang, text] of Object.entries(LANGS)) {
      const r = (text as { rhythm: { hint: Record<string, string>; taunt: Record<string, string>; mode: Record<string, string> } }).rhythm;
      for (const h of spec.hints) expect(r.hint[h.hint], `${lang} rhythm.hint.${h.hint}`).toBeTruthy();
      expect(r.taunt[id], `${lang} rhythm.taunt.${id}`).toBeTruthy();
      expect(r.mode[id], `${lang} rhythm.mode.${id}`).toBeTruthy();
    }
  });

  it.each(MODES)('%s：谱面录制知道这一段认哪些键', id => {
    expect(MODE_KEYS[id].codes.length).toBeGreaterThan(0);
  });
});

describe('谱面的开场白', () => {
  it('写了开场白的谱面：说话的人、每一句都有两种语言的文案；跳不过去的那几句有显示时间', () => {
    for (const chart of CHARTS) {
      if (!chart.intro) continue;
      const { intro } = chart;
      const keys = [intro.speaker, ...intro.talk, ...intro.locked.map(l => l.text), ...intro.locked.flatMap(l => (l.shout ? [l.shout] : []))];
      for (const [lang, text] of Object.entries(LANGS)) {
        for (const k of keys) expect(k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], text), `${chart.id} ${lang} ${k}`).toBeTruthy();
      }
      for (const l of intro.locked) expect(l.ms).toBeGreaterThan(0);
    }
  });
});
