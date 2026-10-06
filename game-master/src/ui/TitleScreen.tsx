import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import playerUrl from '@/asset/player_mid.png';
import { nextLang, setLang } from '@/i18n';
import { isDesktop } from '@/platform';
import { anyPressed, GAMEPAD_BUTTONS, padKind } from '@/shared/gamepad';
import { noteDevice } from '@/game/inputDevice';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { ConfirmButtonIcon, ControllerIcon } from './PadIcons';

/**
 * 标题页：GAME MASTER + 一直在跳的小人；空格 / 回车 / 手柄 A、Start / 点击开始；右上角切换语言。认出手柄后提示换成手柄图标。
 * 有存档时给 onNew：提示换成「继续」，左上角多一个「新游戏」。桌面版右下角多一个「退出」
 */
export function TitleScreen({ onStart, onNew, touch }: { onStart: () => void; onNew?: () => void; touch: boolean }) {
  const { t, i18n } = useTranslation();
  /** 最后用的输入设备（全局识别，见 game/inputDevice.ts）：提示按它显示 */
  const device = useAppSelector(s => s.input.device);
  /** 现在画面上的提示是给哪个设备看的：换了设备，第一下只把提示换过来，不开始；再按一下才开始 */
  const shown = useRef(device);
  useEffect(() => { shown.current = device; }, [device]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      // 全局识别在捕获阶段已经把设备记成键盘了；提示还是手柄的，这一下只换提示
      if (store.getState().input.device !== shown.current) return;
      onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  // 手柄的 A / Start：提示还是键盘的，按下那一下只换成手柄图标（玩家能看到提示变了）；提示已经是手柄的才开始。
  // 进来时就按着的要先松开再按，免得从别处按着带过来
  useEffect(() => {
    let raf = 0, held = true, lastDevice = store.getState().input.device;
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const down = anyPressed(pads, GAMEPAD_BUTTONS.start);
      const dev = store.getState().input.device;
      // 提示刚换了设备（全局识别可能比这里先看到按键）：正按着的这一下不算，松开再按才开始
      if (dev !== lastDevice) { lastDevice = dev; held = true; }
      if (down && !held) {
        const first = Array.from(pads).find(p => !!p);
        const kind = first ? padKind(first.id) : null;
        if (kind) noteDevice(kind);   // 不等轮询，按下就换提示
        if (kind && dev === kind) { onStart(); return; }
      }
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
      {isDesktop && <button className="title-quit" onClick={e => { e.stopPropagation(); window.gameDesktop?.quit(); }}>{t('quit')}</button>}
      {onNew && <button className="title-new" onClick={e => { e.stopPropagation(); onNew(); }}>{t('newGame')}</button>}
      <button className="title-lang" onClick={e => { e.stopPropagation(); setLang(nextLang(i18n.language)); }}>{t('lang')}</button>
      {device !== 'keyboard'
        ? <div className="title-prompt title-prompt-pad"><ControllerIcon /><span>{t(onNew ? 'continuePad.before' : 'startPad.before')}</span><ConfirmButtonIcon kind={device} /><span>{t(onNew ? 'continuePad.after' : 'startPad.after')}</span></div>
        : <div className="title-prompt">{t(onNew ? (touch ? 'continueTouch' : 'continueKey') : (touch ? 'startTouch' : 'startKey'))}</div>}
    </div>
  );
}
