import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { Celebration } from './Celebration';
import { bridge, EVT } from '@/game/bridge';
import { AVATARS } from '@/asset';
import { Typewriter } from './Typewriter';

/** 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
  const { t } = useTranslation();
  const [msgVisible, setMsgVisible] = useState(false);

  useEffect(() => { if (!hud.message) return; setMsgVisible(true); const t = setTimeout(() => setMsgVisible(false), 1100); return () => clearTimeout(t); }, [hud.message]);

  if (hud.mode === 'idle') return null;
  return (
    <div className="hud">
      {hud.boss && (
        <div className="boss-bar">
          {Array.from({ length: hud.boss.max }, (_, i) => <span key={i} className={'seg' + (i < hud.boss!.hp ? ' on' : '')} />)}
        </div>
      )}
      {hud.place && <div className="place">{t('place', { place: hud.place })}</div>}
      {hud.topdown && <div className="score">{hud.score}</div>}
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
          <div className="death-sub">{t('deadHint')}</div>
        </div>
      )}
      {hud.mode === 'won' && (
        <div className="won" onPointerDown={() => { if (!hud.final) bridge.emit(EVT.continueGame); }}>
          <Celebration title={t('won')} subtitle={[t('wonStats', { jumps: hud.jumps, destroyed: hud.destroyed }), hud.final ? '' : t('wonContinue'), hud.playtest ? t('wonEditor') : ''].filter(Boolean).join('　')} />
        </div>
      )}
    </div>
  );
}
