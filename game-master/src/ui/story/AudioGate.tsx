// ===== 网页版打开时的第一屏：「按任意键」=====
// 浏览器在玩家按下任何键之前不让出声，标题画面的音乐和拍菜单的「咚」就听不到了；先等这一下再开始标题画面。
// 桌面版（Electron）没有这个限制，不显示这一屏。
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { anyPressed, GAMEPAD_BUTTONS } from '@/shared/gamepad';

export function AudioGate({ onGo }: { onGo: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    let raf = 0, gone = false;
    const go = () => { if (gone) return; gone = true; onGo(); };
    const tick = () => {
      if (anyPressed(navigator.getGamepads?.() ?? [], [...GAMEPAD_BUTTONS.confirm, ...GAMEPAD_BUTTONS.back, ...GAMEPAD_BUTTONS.jump])) { go(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', go); window.removeEventListener('pointerdown', go); };
  }, [onGo]);
  return <div className="audio-gate"><span>{t('story.pressAny')}</span></div>;
}
