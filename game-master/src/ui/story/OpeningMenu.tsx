// ===== 标题画面的第二段：房间搭好之后，骷髅手从上往下把标题和三个按钮一个个拍进画面（每拍一下画面一震）=====
// 然后手从右边伸进来指着选中的那一项，跟着选择移动；选中时戳一下。
// 「开始」：手像清理桌面一样把标题和按钮扫出画面，然后发 EVT.openingStart（主角出场）。
// 「设置」：设置面板（手指着里面选中的那一项）。「退出」：桌面版直接退出；网页版提示关掉页面。
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { bridge, EVT } from '@/protocol';
import { isDesktop } from '@/platform';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { useAppSelector } from '@/redux/hooks';
import { ConfirmButtonIcon, ControllerIcon } from '@/ui/PadIcons';
import { GmHand, type HandState } from './GmHand';
import { SettingsPanel } from './SettingsPanel';
import { elementBox, isAbort, wait } from './geometry';
import { preloadSfx, sfx, shakeStage } from './sfx';

const ITEMS = ['start', 'settings', 'quit'] as const;
/** 拍下来之前举多高（舞台高的比例）；手伸过来、砸下去、停一下、抬手各多久（毫秒） */
const SLAM = { lift: 0.45, reach: 320, drop: 120, rest: 170, raise: 140 };
/** 扫走：手从右到左扫过去多久；每一项比上一项晚多久飞走 */
const SWEEP = { ms: 520, stagger: 45 };

type Step = 'slam' | 'menu' | 'settings' | 'sweep';

export function OpeningMenu({ stage, stageH, onStarted }: { stage: HTMLElement; stageH: number; onStarted: () => void }) {
  const { t } = useTranslation();
  /** 最后用的输入设备：底下的提示按它显示 */
  const device = useAppSelector(s => s.input.device);
  const [step, setStep] = useState<Step>('slam');
  /** 已经拍好的有几个（标题 + 三个按钮 = 4） */
  const [placed, setPlaced] = useState(0);
  /** 正举在手里、还没拍下来的那一个：举多高（像素）、多久落下去 */
  const [lift, setLift] = useState<{ i: number; dy: number; ms: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [hand, setHand] = useState<HandState | null>(null);
  const [note, setNote] = useState('');
  const [swept, setSwept] = useState(false);
  /** 在设置里清除了进度：「开始」从头开一局 */
  const cleared = useRef(false);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const settingsTarget = useRef<HTMLElement | null>(null);

  // ---- 拍进来 ----
  useEffect(() => {
    preloadSfx('slam', 'whoosh', 'click');
    const ac = new AbortController(), s = ac.signal;
    (async () => {
      for (let i = 0; i < ITEMS.length + 1; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const b = elementBox(stage, el), dy = stageH * SLAM.lift, cx = b.x + b.w / 2;
        setLift({ i, dy, ms: 0 });
        setHand({ at: { x: cx, y: b.y - dy }, pose: 'open', from: 'top', anchor: 'palm', ms: i === 0 ? SLAM.reach + 150 : SLAM.reach });
        await wait(i === 0 ? SLAM.reach + 150 : SLAM.reach, s);
        setLift({ i, dy: 0, ms: SLAM.drop });
        setHand({ at: { x: cx, y: b.y }, pose: 'open', from: 'top', anchor: 'palm', ms: SLAM.drop });
        await wait(SLAM.drop, s);
        setPlaced(i + 1); setLift(null);
        sfx('slam', i === 0 ? 1 : 0.8);
        shakeStage(stage, i === 0);
        await wait(SLAM.rest, s);
        setHand({ at: { x: cx, y: b.y - stageH * 0.3 }, pose: 'open', from: 'top', anchor: 'palm', ms: SLAM.raise });
        await wait(SLAM.raise, s);
      }
      setStep('menu');
    })().catch(e => { if (!isAbort(e)) throw e; });
    return () => ac.abort();
  }, [stage, stageH]);

  // ---- 手指着选中的那一项（从右边伸进来） ----
  const pointAt = useCallback((el: HTMLElement | null, ms = 220) => {
    if (!el) return;
    const b = elementBox(stage, el);
    setHand({ at: { x: b.x + b.w + 6, y: b.y + b.h / 2 }, pose: 'point', from: 'right', anchor: 'tip', ms });
  }, [stage]);
  useEffect(() => { if (step === 'menu') pointAt(refs.current[index + 1]); }, [step, index, pointAt]);
  useEffect(() => {   // 窗口变了：重新对准
    if (step !== 'menu' && step !== 'settings') return;
    pointAt(step === 'menu' ? refs.current[index + 1] : settingsTarget.current, 0);
  }, [stageH]);   // eslint-disable-line react-hooks/exhaustive-deps -- 只在舞台大小变时

  /** 戳一下（选中），然后做那件事 */
  const poke = useCallback((i: number, then: () => void) => {
    const el = refs.current[i + 1];
    if (!el) { then(); return; }
    const b = elementBox(stage, el);
    sfx('click');
    setHand({ at: { x: b.x + b.w - 10, y: b.y + b.h / 2 }, pose: 'point', from: 'right', anchor: 'tip', ms: 90 });
    window.setTimeout(() => { pointAt(el, 120); then(); }, 110);
  }, [stage, pointAt]);

  const sweep = useCallback(() => {
    setStep('sweep');
    const els = refs.current.filter((e): e is HTMLElement => !!e);
    const top = Math.min(...els.map(e => elementBox(stage, e).y)), bottom = Math.max(...els.map(e => { const b = elementBox(stage, e); return b.y + b.h; }));
    const y = (top + bottom) / 2, right = stage.clientWidth;
    setHand({ at: { x: right + 40, y }, pose: 'open', from: 'right', anchor: 'palm', ms: 0 });
    window.setTimeout(() => {
      sfx('whoosh');
      setHand({ at: { x: -stage.clientWidth * 0.2, y }, pose: 'open', from: 'right', anchor: 'palm', ms: SWEEP.ms, tilt: -8 });
      window.setTimeout(() => setSwept(true), SWEEP.ms * 0.35);
      window.setTimeout(() => { setHand(null); bridge.emit(EVT.openingStart, { fresh: cleared.current }); onStarted(); }, SWEEP.ms + SWEEP.stagger * 4 + 200);
    }, 60);
  }, [stage, onStarted]);

  const pick = useCallback((i: number) => {
    if (step !== 'menu') return;
    const item = ITEMS[i];
    poke(i, () => {
      if (item === 'start') sweep();
      else if (item === 'settings') setStep('settings');
      else if (isDesktop) window.gameDesktop?.quit();
      else { setNote(t('story.quitWeb')); window.setTimeout(() => setNote(''), 2600); }
    });
  }, [step, poke, sweep, t]);

  useMenuNav({ count: ITEMS.length, index, enabled: step === 'menu', setIndex: i => { setIndex(i); sfx('click', 0.4); }, onPick: pick });

  const onSettingsFocus = useCallback((el: HTMLElement | null) => { settingsTarget.current = el; pointAt(el); }, [pointAt]);

  /** 第 i 个（0 = 标题）现在什么样：还没轮到 = 不显示；举在手里 = 往上挪 dy；扫走了 = 飞出左边 */
  const itemStyle = (i: number): CSSProperties => {
    if (swept) return { transform: `translateX(${-stage.clientWidth * 1.2}px) rotate(-25deg)`, transition: `transform ${SWEEP.ms}ms cubic-bezier(.5, 0, .9, .4) ${(ITEMS.length - i) * SWEEP.stagger}ms` };
    if (lift?.i === i) return { transform: `translateY(${-lift.dy}px)`, transition: lift.ms ? `transform ${lift.ms}ms cubic-bezier(.6, 0, 1, .6)` : 'none' };
    return i < placed ? {} : { visibility: 'hidden' };
  };

  return (
    <div className="opening">
      <div className={'op-menu' + (step === 'settings' ? ' dim' : '')}>
        <h1 ref={el => { refs.current[0] = el; }} className="op-title" style={itemStyle(0)}>GAME<br />MASTER</h1>
        {ITEMS.map((item, i) => (
          <button key={item} ref={el => { refs.current[i + 1] = el; }} className={'op-btn' + (step === 'menu' && index === i ? ' sel' : '')} style={itemStyle(i + 1)}
            onMouseEnter={() => { if (step === 'menu' && index !== i) setIndex(i); }} onClick={() => pick(i)}>
            {t(`story.menu.${item}`)}
          </button>
        ))}
        {note && <div className="op-note">{note}</div>}
      </div>
      {step === 'menu' && (device === 'keyboard'
        ? <div className="op-hint">{t('story.hint.key')}</div>
        : <div className="op-hint pad"><ControllerIcon /><ConfirmButtonIcon kind={device} /><span>{t('story.hint.pad')}</span></div>)}
      {step === 'settings' && <SettingsPanel onFocus={onSettingsFocus} onCleared={() => { cleared.current = true; }} onClose={() => setStep('menu')} />}
      <GmHand hand={hand} stageH={stageH} />
    </div>
  );
}
