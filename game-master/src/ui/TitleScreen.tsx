import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import playerUrl from '@/asset/player_mid.png';
import { setLang } from '@/i18n';
import { anyPressed, GAMEPAD_BUTTONS, padKind, type PadKind } from '@/game/gamepad';
import { ConfirmButtonIcon, ControllerIcon } from './PadIcons';

/** 标题页：GAME MASTER + 一直在跳的小人；空格 / 回车 / 手柄 A、Start / 点击开始；右上角切换语言。认出手柄后提示换成手柄图标 */
export function TitleScreen({ onStart, touch }: { onStart: () => void; touch: boolean }) {
  const { t, i18n } = useTranslation();
  /** 认出来的手柄（第一个）；null = 没有手柄 */
  const [pad, setPad] = useState<PadKind | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onStart(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  // 手柄：每帧查一次。认出手柄（或换了一种手柄）就把提示换成手柄图标；A / Start 按下的那一刻开始。
  // 浏览器要按一下手柄才认得出它：认出来的那一下只换提示、不开始，等松开再按，玩家能看到提示变了。
  // 进来时就按着的也要先松开，免得从别处按着带过来
  useEffect(() => {
    let raf = 0, held = true, kind: PadKind | null = null;
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const first = Array.from(pads).find(p => !!p);
      const now = first ? padKind(first.id) : null;
      if (now !== kind) { if (!kind) held = true; kind = now; setPad(now); }
      const down = anyPressed(pads, GAMEPAD_BUTTONS.start);
      if (down && !held) { onStart(); return; }
      held = down;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onStart]);

  return (
    <div className="title-screen" onClick={onStart}>
      <h1 className="title-logo">
        <span>GAME</span>
        <span className="title-line2">MASTER<img className="title-hero" src={playerUrl} alt="" /></span>
      </h1>
      <button className="title-lang" onClick={e => { e.stopPropagation(); setLang(i18n.language === 'zh' ? 'en' : 'zh'); }}>{t('lang')}</button>
      {pad
        ? <div className="title-prompt title-prompt-pad"><ControllerIcon /><span>{t('startPad.before')}</span><ConfirmButtonIcon kind={pad} /><span>{t('startPad.after')}</span></div>
        : <div className="title-prompt">{t(touch ? 'startTouch' : 'startKey')}</div>}
    </div>
  );
}
