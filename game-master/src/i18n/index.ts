// ===== 多语言：i18next + react-i18next =====
// 玩家看得到的界面文字都从这里取（t('key')）。加语言 = 在 resources 里加一份。
// 默认中文；浏览器语言是英文时用英文；localStorage 'climb:lang' 可以强制。
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh.json';
import en from './en.json';

export const LANGS = { zh: '中文', en: 'English' } as const;
export type Lang = keyof typeof LANGS;

function detect(): Lang {
  try { const saved = localStorage.getItem('climb:lang') as Lang | null; if (saved && saved in LANGS) return saved; } catch { /* 隐私模式 */ }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
}

void i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: detect(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  try { localStorage.setItem('climb:lang', lang); } catch { /* 隐私模式 */ }
}

export default i18n;
