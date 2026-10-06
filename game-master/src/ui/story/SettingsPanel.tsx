// ===== 设置（标题菜单里点「设置」）：音乐音量、语言、全屏、清除进度、返回 =====
// 键盘 / 手柄 / 鼠标都能用（ui/menu/useMenuNav）；← → 调音量、换语言。「清除进度」先问一下。
// onFocus 把当前选中的那一项交出去：标题菜单的骷髅手指着它。
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { setConfig } from '@/redux/slices/configSlice';
import { clearRun } from '@/redux/slices/runSlice';
import { LANGS, nextLang, setLang, type Lang } from '@/i18n';
import { isDesktop } from '@/platform';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { sfx } from './sfx';

type Item = 'volume' | 'language' | 'fullscreen' | 'clear' | 'back';
const ITEMS: Item[] = ['volume', 'language', 'fullscreen', 'clear', 'back'];
const VOLUME_STEP = 0.1;

const isFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenElement;
function toggleFullscreen(): void {
  if (isDesktop && window.gameDesktop?.toggleFullscreen) { window.gameDesktop.toggleFullscreen(); return; }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

export function SettingsPanel({ onClose, onCleared, onFocus }: { onClose: () => void; onCleared: () => void; onFocus: (el: HTMLElement | null) => void }) {
  const { t, i18n } = useTranslation();
  const volume = useAppSelector(s => s.config.musicVolume);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState<number | null>(null);   // 「清除进度？」：0 取消 / 1 清除
  const [full, setFull] = useState(isFullscreen);
  const [note, setNote] = useState('');
  const rows = useRef<(HTMLElement | null)[]>([]);
  const confirmRows = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const on = () => setFull(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  // 手指着选中的那一项
  useEffect(() => { onFocus(confirm === null ? rows.current[index] : confirmRows.current[confirm]); }, [index, confirm, onFocus, i18n.language]);

  const adjust = (item: Item, dir: -1 | 1) => {
    if (item === 'volume') {
      const v = Math.round(Math.max(0, Math.min(1, volume + dir * VOLUME_STEP)) * 10) / 10;
      if (v !== volume) { store.dispatch(setConfig({ musicVolume: v })); sfx('click', 0.6); }
    } else if (item === 'language') {
      const all = Object.keys(LANGS) as Lang[], cur = all.indexOf(i18n.language as Lang);
      setLang(all[(cur + dir + all.length) % all.length]);
      sfx('click', 0.6);
    }
  };
  const pick = (i: number) => {
    const item = ITEMS[i];
    sfx('click');
    if (item === 'volume') adjust('volume', volume >= 1 ? -1 : 1);
    else if (item === 'language') setLang(nextLang(i18n.language));
    else if (item === 'fullscreen') toggleFullscreen();
    else if (item === 'clear') setConfirm(0);
    else onClose();
  };

  useMenuNav({
    count: ITEMS.length, index, enabled: confirm === null,
    setIndex: i => { setIndex(i); sfx('click', 0.4); },
    onPick: pick, onBack: () => { sfx('click'); onClose(); },
    onAdjust: (i, dir) => { if (ITEMS[i] === 'volume' || ITEMS[i] === 'language') adjust(ITEMS[i], dir); else setIndex((i + dir + ITEMS.length) % ITEMS.length); },
  });
  const pickConfirm = (i: number) => {
    sfx('click');
    setConfirm(null);
    if (i !== 1) return;
    store.dispatch(clearRun());
    setNote(t('story.settings.cleared'));
    onCleared();
  };
  useMenuNav({
    count: 2, index: confirm ?? 0, enabled: confirm !== null,
    setIndex: i => { setConfirm(i); sfx('click', 0.4); },
    onPick: pickConfirm, onBack: () => setConfirm(null),
  });

  const value = (item: Item) => {
    if (item === 'volume') return <span className="st-bar">{Array.from({ length: 10 }, (_, k) => <i key={k} className={k < Math.round(volume * 10) ? 'on' : ''} />)}</span>;
    if (item === 'language') return <span className="st-val">‹ {LANGS[i18n.language as Lang] ?? i18n.language} ›</span>;
    if (item === 'fullscreen') return <span className="st-val">{t(full ? 'story.settings.on' : 'story.settings.off')}</span>;
    return null;
  };
  const label = (item: Item) => t(item === 'clear' ? 'story.settings.clear' : `story.settings.${item}`);

  return (
    <div className="op-settings" role="dialog" aria-label={t('story.settings.title')}>
      <div className="st-title">{t('story.settings.title')}</div>
      {confirm === null
        ? ITEMS.map((item, i) => (
          <button key={item} ref={el => { rows.current[i] = el; }} className={'st-row' + (i === index ? ' sel' : '') + (item === 'clear' ? ' danger' : '')}
            onMouseEnter={() => setIndex(i)} onClick={() => pick(i)}>
            <span>{label(item)}</span>{value(item)}
          </button>
        ))
        : <>
          <div className="st-ask">{t('story.settings.clearConfirm')}</div>
          {(['clearNo', 'clearYes'] as const).map((k, i) => (
            <button key={k} ref={el => { confirmRows.current[i] = el; }} className={'st-row' + (i === confirm ? ' sel' : '') + (i === 1 ? ' danger' : '')}
              onMouseEnter={() => setConfirm(i)} onClick={() => pickConfirm(i)}>{t(`story.settings.${k}`)}</button>
          ))}
        </>}
      {note && <div className="st-note">{note}</div>}
    </div>
  );
}
