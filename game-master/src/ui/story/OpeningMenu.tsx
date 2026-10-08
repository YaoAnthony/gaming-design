// 标题牌子先甩进来挂稳（OpeningTitle）；落稳之后按钮才淡入，木手从右边画面外滑进来指着选中的那一项，点击时轻戳一下。
// 开始 / 继续时标题松开吊带落下，按钮淡出，再通知游戏开始。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bridge, EVT } from '@/protocol';
import { isDesktop } from '@/platform';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { ConfirmButtonIcon, ControllerIcon } from '@/ui/PadIcons';
import { GmHand, type HandState } from './GmHand';
import { SettingsPanel } from './SettingsPanel';
import { ConfirmModal } from './ConfirmModal';
import { elementBox } from './geometry';
import { preloadSfx, sfx } from './sfx';
import { OpeningTitle, type OpeningTitleHandle } from './OpeningTitle';

type Item = 'continue' | 'start' | 'settings' | 'quit';
const menuItems = (hasSave: boolean): Item[] => (hasSave ? ['continue', 'start', 'settings', 'quit'] : ['start', 'settings', 'quit']);
/** entering = 牌子还在往下甩、没挂稳：按钮藏着、手还没来 */
type Step = 'entering' | 'menu' | 'settings' | 'confirm' | 'leaving';
/** 手第一次从右边滑进来用多久（毫秒） */
const HAND_ENTER_MS = 480;

export function OpeningMenu({ stage, stageH }: { stage: HTMLElement; stageH: number }) {
  const { t } = useTranslation();
  const device = useAppSelector(s => s.input.device);
  const [step, setStep] = useState<Step>('entering');
  const [index, setIndex] = useState(0);
  const [hand, setHand] = useState<HandState | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState(() => menuItems(store.getState().run.active));
  const hasSave = items[0] === 'continue';
  const refs = useRef<(HTMLElement | null)[]>([]);
  const titleControl = useRef<OpeningTitleHandle | null>(null);
  const titleEntry = useRef<Promise<void>>(Promise.resolve());
  const lifetime = useRef<AbortController | null>(null);
  const settingsTarget = useRef<HTMLElement | null>(null);
  /** 手已经滑进来过了（之后只在按钮之间挪） */
  const handEntered = useRef(false);

  useEffect(() => {
    preloadSfx('slam', 'whoosh', 'click');
    const ac = new AbortController();
    lifetime.current = ac;
    titleEntry.current = titleControl.current?.enter() ?? Promise.resolve();
    // 牌子挂稳了才轮到菜单：按钮淡入、手进来
    titleEntry.current.then(() => { if (!ac.signal.aborted) setStep('menu'); });
    return () => ac.abort();
  }, []);

  const pointAt = useCallback((el: HTMLElement | null, ms = 220) => {
    if (!el) return;
    const b = elementBox(stage, el);
    setHand({ at: { x: b.x + b.w + 6, y: b.y + b.h / 2 }, pose: 'point', from: 'right', anchor: 'tip', ms });
  }, [stage]);
  useEffect(() => {
    if (step !== 'menu') return;
    const el = refs.current[index];
    if (handEntered.current || !el) { pointAt(el); return; }
    // 第一次：手先放在右边画面外，再滑进来指着
    handEntered.current = true;
    const b = elementBox(stage, el);
    setHand({ at: { x: stage.clientWidth + stageH * 0.6, y: b.y + b.h / 2 }, pose: 'point', from: 'right', anchor: 'tip', ms: 0 });
    const timer = window.setTimeout(() => pointAt(el, HAND_ENTER_MS), 40);
    return () => window.clearTimeout(timer);
  }, [step, index, pointAt, stage, stageH]);
  useEffect(() => {
    if (step !== 'menu' && step !== 'settings' && step !== 'confirm') return;
    pointAt(step === 'menu' ? refs.current[index] : settingsTarget.current, 0);
  }, [stageH]); // eslint-disable-line react-hooks/exhaustive-deps -- Realign only when the stage size changes.

  const poke = useCallback((i: number, then: () => void) => {
    const el = refs.current[i], signal = lifetime.current?.signal;
    if (!el) { then(); return; }
    const b = elementBox(stage, el);
    sfx('click');
    setHand({ at: { x: b.x + b.w - 10, y: b.y + b.h / 2 }, pose: 'point', from: 'right', anchor: 'tip', ms: 90 });
    window.setTimeout(() => { if (!signal?.aborted) { pointAt(el, 120); then(); } }, 110);
  }, [stage, pointAt]);

  const startGame = useCallback((mode: 'new' | 'continue') => {
    const signal = lifetime.current?.signal;
    setStep('leaving');
    setHand(null);
    void (async () => {
      // If selected immediately, finish placing the title before releasing its straps.
      await titleEntry.current;
      if (signal?.aborted) return;
      await titleControl.current?.drop();
      if (!signal?.aborted) bridge.emit(EVT.openingStart, { mode });
    })();
  }, []);

  const pick = useCallback((i: number) => {
    if (step !== 'menu') return;
    const item = items[i];
    poke(i, () => {
      if (item === 'continue') startGame('continue');
      else if (item === 'start') { if (hasSave) setStep('confirm'); else startGame('new'); }
      else if (item === 'settings') setStep('settings');
      else if (isDesktop) window.gameDesktop?.quit();
      else { setNote(t('story.quitWeb')); window.setTimeout(() => setNote(''), 2600); }
    });
  }, [step, items, hasSave, poke, startGame, t]);

  useMenuNav({ count: items.length, index, enabled: step === 'menu', setIndex: i => { setIndex(i); sfx('click', 0.4); }, onPick: pick });
  const onSettingsFocus = useCallback((el: HTMLElement | null) => { settingsTarget.current = el; pointAt(el); }, [pointAt]);

  return (
    <div className="opening">
      <div className={'op-menu' + (step === 'settings' || step === 'confirm' ? ' dim' : step === 'leaving' ? ' leaving' : step === 'entering' ? ' entering' : '')}>
        <OpeningTitle stage={stage} control={titleControl} />
        {items.map((item, i) => (
          <button key={item} ref={el => { refs.current[i] = el; }} className={'op-btn' + (step === 'menu' && index === i ? ' sel' : '')}
            disabled={step === 'leaving' || step === 'entering'} onMouseEnter={() => { if (step === 'menu' && index !== i) setIndex(i); }} onClick={() => pick(i)}>
            {t(`story.menu.${item}`)}
          </button>
        ))}
        {note && <div className="op-note">{note}</div>}
      </div>
      {step === 'menu' && (device === 'keyboard'
        ? <div className="op-hint">{t('story.hint.key')}</div>
        : <div className="op-hint pad"><ControllerIcon /><ConfirmButtonIcon kind={device} /><span>{t('story.hint.pad')}</span></div>)}
      {step === 'settings' && <SettingsPanel onFocus={onSettingsFocus} onCleared={() => { setItems(menuItems(false)); setIndex(0); }} onClose={() => setStep('menu')} />}
      {step === 'confirm' && <ConfirmModal text={t('story.menu.newConfirm')} no={t('story.menu.newNo')} yes={t('story.menu.newYes')}
        onFocus={onSettingsFocus} onNo={() => setStep('menu')} onYes={() => startGame('new')} />}
      <GmHand hand={hand} stageH={stageH} />
    </div>
  );
}
