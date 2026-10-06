// 每种节奏玩法都要齐：在它那个世界里有实现、底下有按键提示、两种语言都有提示和喊话的文案、谱面录制知道它用哪些键。
// 加新玩法漏了哪一样，这里会报出来（不然要到游戏里换到那一段才发现）
import { describe, expect, it } from 'vitest';
import { RHYTHM_MODES, type ModeId } from '@/rhythm/modes';
import { hasFlatMode } from '@/game/rhythm/modes/define';
import '@/game/rhythm/modes';
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
