// ===== 多语言：i18next + react-i18next =====
// 玩家看得到的界面文字都从这里取（t('key')）。加语言 = 在 resources 里加一份。
// 默认英文；标题页可以切换，选过的语言记在 store.settings.lang（persist.ts 一起存）。
// 游戏代码里的文字写成 key（msg.* / death.* / npc.* / dialogue.*）；地图里填的文字（层名、位置）原样写英文，中文放在 map.* 下。
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh.json';
import en from './en.json';
import { store } from '@/redux/store';
import { setLangSetting } from '@/redux/slices/settingsSlice';

export type { TKey, MsgKey, DeathKey } from './keys';

export { LANGS, isLang, nextLang, type Lang } from './langs';
import type { Lang } from './langs';


void i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: store.getState().settings.lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  store.dispatch(setLangSetting(lang));
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** 地图里作者填的文字（层名、位置）：有 map.<原文> 的翻译就用，没有就原样显示 */
export function mapText(text: string): string {
  return text ? i18n.t(`map.${text}`, { defaultValue: text }) : text;
}

/** 游戏代码里的 key → 当前语言；不是 key 的文字原样返回 */
export function tr(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, { defaultValue: key, ...params });
}

export default i18n;
