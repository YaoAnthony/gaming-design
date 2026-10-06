// ===== 暂停菜单（游戏里按 ESC / 手柄 Start，场景停着）：继续、设置（音量、语言、全屏）、回到标题 =====
// 键盘 / 手柄 / 鼠标都能用（ui/menu/useMenuNav）；Esc / B = 继续。设置用标题画面那个面板（不带「清除进度」）。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { setPaused } from '@/redux/slices/hudSlice';
import { bridge, EVT } from '@/protocol';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { SettingsPanel } from './story/SettingsPanel';
import { sfx } from './story/sfx';

const ITEMS = ['resume', 'settings', 'toTitle'] as const;

export function PauseMenu() {
  const paused = useAppSelector(s => s.hud.paused);
  return paused ? <PausePanel /> : null;
}

function PausePanel() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [settings, setSettings] = useState(false);
  const resume = () => bridge.emit(EVT.resumeGame);

  const pick = (i: number) => {
    sfx('click');
    const item = ITEMS[i];
    if (item === 'resume') resume();
    else if (item === 'settings') setSettings(true);
    else { store.dispatch(setPaused(false)); bridge.emit(EVT.toTitle); }
  };
  useMenuNav({ count: ITEMS.length, index, enabled: !settings, setIndex: i => { setIndex(i); sfx('click', 0.4); }, onPick: pick, onBack: () => { sfx('click'); resume(); } });

  return (
    <div className="pause-layer">
      {settings
        ? <SettingsPanel noClear onClose={() => setSettings(false)} />
        : <div className="op-settings pause-menu" role="dialog" aria-label={t('pause.title')}>
          <div className="st-title">{t('pause.title')}</div>
          {ITEMS.map((item, i) => (
            <button key={item} className={'st-row' + (i === index ? ' sel' : '')} onMouseEnter={() => setIndex(i)} onClick={() => pick(i)}>
              <span>{t(`pause.${item}`)}</span>
            </button>
          ))}
        </div>}
    </div>
  );
}
