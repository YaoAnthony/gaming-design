import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { WinModal } from './WinModal';
import { bridge, EVT } from '@/protocol';
import { AVATARS, HEART_ICONS } from '@/asset';
import { Typewriter } from './Typewriter';
import { ResetButtonIcon } from './PadIcons';

/** 节奏关卡每种玩法的按键提示：按哪些键、干什么（文案在 i18n 的 rhythm.hint 下） */
const RHYTHM_KEYS: Record<string, { keys: string[]; hint: string }[]> = {
  giveup: [{ keys: ['␣'], hint: 'hop' }],
  dash: [{ keys: ['␣'], hint: 'flip' }],
  taiko: [{ keys: ['A'], hint: 'red' }, { keys: ['D'], hint: 'blue' }],
  mania: [{ keys: ['A', 'S', 'D'], hint: 'lanes' }, { keys: ['━'], hint: 'hold' }],
  osu: [{ keys: ['Q', 'W', 'E', 'R'], hint: 'ring' }, { keys: ['━'], hint: 'hold' }],
  saber: [{ keys: ['A', 'D'], hint: 'move' }, { keys: ['␣'], hint: 'slash' }],
  dodge: [{ keys: ['A', 'D'], hint: 'switch' }, { keys: ['␣'], hint: 'jump' }],
};

/** 好几管血时，除了最上面那一管（金色）之外的颜色有几种，轮着用（样式在 app.css 的 .tube-cN） */
const TUBE_COLORS = 6;

/**
 * Boss 的血条。per = 一管多少滴：血多的时候分成好几管，只画最上面那一管，打空的格子露出下一管的颜色，旁边写还剩几管。
 * 管越多血条越大、一管一个颜色；满管数的那一管（最后填上的）是金色的，带流光
 */
function BossBar({ hp, max, per }: { hp: number; max: number; per?: number }) {
  if (!per || max <= per) return <div className="boss-bar">{Array.from({ length: max }, (_, i) => <span key={i} className={'seg' + (i < hp ? ' on' : '')} />)}</div>;
  const tubes = Math.ceil(max / per), bars = Math.ceil(hp / per), top = hp - (bars - 1) * per;   // 一共几管；还剩几管；最上面那一管剩几滴
  const color = (n: number) => (n >= tubes ? ' tube-gold' : ' tube-c' + ((n - 1) % TUBE_COLORS));   // 第 n 管（1 起）什么颜色
  return (
    <div className={'boss-bar tubes' + (bars >= tubes && bars > 0 ? ' crowned' : '')} style={{ '--tube': Math.max(0, bars - 1) } as CSSProperties}>
      {Array.from({ length: per }, (_, i) => <span key={i} className={'seg' + (i < top ? ' on' + color(bars) : bars > 1 ? ' under' + color(bars - 1) : '')} />)}
      <span key={bars} className="tube-count">×{bars}</span>
    </div>
  );
}

/** 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
  const { t } = useTranslation();
  const [msgVisible, setMsgVisible] = useState(false);
  /** 最后用的输入设备：提示按它显示（键盘写 R，手柄画重置键） */
  const device = useAppSelector(s => s.input.device);

  // 真结束（最后一层）关掉弹窗后不能继续玩，只是把弹窗收起来；下次通关再出现
  const [winClosed, setWinClosed] = useState(false);
  useEffect(() => { if (hud.mode !== 'won') setWinClosed(false); }, [hud.mode]);

  useEffect(() => { if (!hud.message) return; setMsgVisible(true); const t = setTimeout(() => setMsgVisible(false), 1100); return () => clearTimeout(t); }, [hud.message]);

  if (hud.mode === 'idle') return null;
  return (
    <div className="hud">
      {hud.bossIntro === 'warning' && (
        <div className="boss-warning">
          <div className="bw-band">
            <div className="bw-stripes" />
            <div className="bw-text">{t('bossIntro.warning')}</div>
            <div className="bw-sub">{t('bossIntro.approach')}</div>
            <div className="bw-stripes" />
          </div>
        </div>
      )}
      {hud.bossIntro === 'title' && (
        <div className="boss-title">
          <div className="bt-sub">{t('bossIntro.sub')}</div>
          <div className="bt-name">{t('bossIntro.name')}</div>
          <div className="bt-line" />
        </div>
      )}
      {hud.boss && (
        <BossBar {...hud.boss} />
      )}
      {hud.hearts?.tiered && (
        <div className="hearts" aria-label={`${hud.hearts.hp} / ${hud.hearts.max}`}>
          {/* 两滴血一格：满格金色，剩一滴红色，空了是空格。key 带上状态：变了就重新挂载，播一次「掉心」动画 */}
          {Array.from({ length: Math.ceil(hud.hearts.max / 2) }, (_, i) => {
            const left = hud.hearts!.hp - i * 2, state = left >= 2 ? 'gold' : left === 1 ? 'full' : 'empty';
            return <img key={`${i}-${state}`} className={'heart ' + state} src={state === 'empty' ? HEART_ICONS.empty : HEART_ICONS.full} alt="" draggable={false} />;
          })}
        </div>
      )}
      {hud.hearts && !hud.hearts.tiered && (
        <div className="hearts" aria-label={`${hud.hearts.hp} / ${hud.hearts.max}`}>
          {/* key 带上满 / 空：一颗心从满变空时重新挂载，播一次「掉心」动画 */}
          {Array.from({ length: hud.hearts.max }, (_, i) => {
            const full = i < hud.hearts!.hp;
            return <img key={`${i}-${full}`} className={'heart ' + (full ? 'full' : 'empty')} src={full ? HEART_ICONS.full : HEART_ICONS.empty} alt="" draggable={false} />;
          })}
        </div>
      )}
      {hud.place && <div className="place">{t('place', { place: hud.place })}</div>}
      {hud.score !== null && <div className="score">{hud.score}</div>}
      {hud.whiteout > 0 && <div key={hud.whiteout} className="whiteout" />}
      {hud.rhythm?.mode && RHYTHM_KEYS[hud.rhythm.mode] && (
        <div className="rhythm-keys">
          {RHYTHM_KEYS[hud.rhythm.mode].map(k => (
            <span key={k.hint} className="rk-item">{k.keys.map(c => <kbd key={c}>{c}</kbd>)}<span>{t(`rhythm.hint.${k.hint}`)}</span></span>
          ))}
        </div>
      )}
      {hud.rhythm?.judge && (
        // key 带上 seq：每次判定重新挂载，播一次弹出的动画
        <div key={hud.rhythm.seq} className={'rhythm-judge ' + hud.rhythm.judge}>
          <div className="rj-word">{t(`rhythm.judge.${hud.rhythm.judge}`)}</div>
          {hud.rhythm.combo > 1 && <div className="rj-combo">{hud.rhythm.combo}</div>}
        </div>
      )}
      {hud.message && <div className={'hud-msg' + (msgVisible ? ' show' : '')} style={{ color: hud.message.color }}>{hud.message.text}</div>}
      {hud.mode === 'playing' && hud.dialogue?.shout && <div key={hud.dialogue.index} className="dialogue-shout">{hud.dialogue.shout}</div>}
      {hud.mode === 'playing' && hud.dialogue && (
        <div className={'dialogue pos-' + (hud.dialogue.pos ?? 'bottom')}>
          {hud.dialogue.avatar && AVATARS[hud.dialogue.avatar] && <img className="dialogue-avatar" src={AVATARS[hud.dialogue.avatar]} alt="" />}
          <div className="dialogue-body">
            <div className="dialogue-name">{hud.dialogue.speaker}</div>
            <div className={'dialogue-text' + (hud.dialogue.grow ? ' grow' : '')}><Typewriter key={hud.dialogue.index + ":" + hud.dialogue.text} text={hud.dialogue.text} grow={hud.dialogue.grow} /></div>
            {!hud.dialogue.auto && <div className="dialogue-hint">▸</div>}
          </div>
        </div>
      )}
      {hud.mode === 'dead' && (
        <div className="death" onPointerDown={() => bridge.emit(EVT.requestReset)}>
          <div className="death-title">{t('dead')}</div>
          {device === 'keyboard'
            ? <div className="death-sub">{t('deadHint')}</div>
            : <div className="death-sub death-sub-pad"><span>{t('deadPad.before')}</span><ResetButtonIcon kind={device} /><span>{t('deadPad.after')}</span></div>}
        </div>
      )}
      {hud.mode === 'won' && !winClosed && (
        <WinModal jumps={hud.jumps} destroyed={hud.destroyed} playtest={hud.playtest} final={hud.final} stage={hud.wonStage} hat={hud.wonHat}
          onClose={() => { if (hud.final) setWinClosed(true); else bridge.emit(EVT.continueGame); }}
          onRetry={() => bridge.emit(EVT.restartGame)}
          onNext={() => bridge.emit(EVT.nextLevel)} />
      )}
    </div>
  );
}
