// ===== 有哪几种语言（不依赖 store：存档读语言设置时也要用，不能绕回 i18n/index.ts 再绕回 store）=====
// 加语言：这里加一项，i18n/index.ts 的 resources 加一份翻译
export const LANGS = { zh: '中文', en: 'English' } as const;
export type Lang = keyof typeof LANGS;

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && Object.hasOwn(LANGS, v);

/** 标题页的语言按钮：按一下换到下一种 */
export function nextLang(lang: string): Lang {
  const all = Object.keys(LANGS) as Lang[];
  return all[(all.indexOf(lang as Lang) + 1) % all.length];
}
