import { useEffect, useState } from 'react';
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
  dash: [{ keys: ['W'], hint: 'top' }, { keys: ['S'], hint: 'bottom' }],
  taiko: [{ keys: ['A'], hint: 'red' }, { keys: ['D'], hint: 'blue' }],
  mania: [{ keys: ['A', 'S', 'D'], hint: 'lanes' }, { keys: ['━'], hint: 'hold' }],
  osu: [{ keys: ['Q', 'W', 'E', 'R'], hint: 'ring' }, { keys: ['━'], hint: 'hold' }],
  saber: [{ keys: ['A', 'D'], hint: 'move' }, { keys: ['␣'], hint: 'slash' }],
  dodge: [{ keys: ['A', 'D'], hint: 'switch' }, { keys: ['␣'], hint: 'jump' }],
};

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
        <div className="boss-bar">
          {Array.from({ length: hud.boss.max }, (_, i) => <span key={i} className={'seg' + (i < hud.boss!.hp ? ' on' : '')} />)}
        </div>
      )}
      {hud.hearts && (
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
      {hud.mode === 'playing' && hud.dialogue && (
        <div className={'dialogue pos-' + (hud.dialogue.pos ?? 'bottom')}>
          {hud.dialogue.avatar && AVATARS[hud.dialogue.avatar] && <img className="dialogue-avatar" src={AVATARS[hud.dialogue.avatar]} alt="" />}
          <div className="dialogue-body">
            <div className="dialogue-name">{hud.dialogue.speaker}</div>
            <div className="dialogue-text"><Typewriter key={hud.dialogue.index + ":" + hud.dialogue.text} text={hud.dialogue.text} /></div>
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
