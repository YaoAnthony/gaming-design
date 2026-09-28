import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import playerUrl from '@/asset/player_mid.png';
import { setLang } from '@/i18n';

/** 标题页：GAME MASTER + 一直在跳的小人；空格 / 回车 / 点击开始；右上角切换语言 */
export function TitleScreen({ onStart, touch }: { onStart: () => void; touch: boolean }) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onStart(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="title-screen" onClick={onStart}>
      <h1 className="title-logo">
        <span>GAME</span>
        <span className="title-line2">MASTER<img className="title-hero" src={playerUrl} alt="" /></span>
      </h1>
      <button className="title-lang" onClick={e => { e.stopPropagation(); setLang(i18n.language === 'zh' ? 'en' : 'zh'); }}>{t('lang')}</button>
      <div className="title-prompt">{t(touch ? 'startTouch' : 'startKey')}</div>
    </div>
  );
}
