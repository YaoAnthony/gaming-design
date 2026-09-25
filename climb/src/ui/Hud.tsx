import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { WinModal } from './WinModal';
import { bridge, EVT } from '@/game/bridge';
import { AVATARS } from '@/asset';
import { Typewriter } from './Typewriter';

/** 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
  const { t } = useTranslation();
  const [msgVisible, setMsgVisible] = useState(false);

  // 真结束（最后一层）关掉弹窗后不能继续玩，只是把弹窗收起来；下次通关再出现
  const [winClosed, setWinClosed] = useState(false);
  useEffect(() => { if (hud.mode !== 'won') setWinClosed(false); }, [hud.mode]);

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
      {hud.score !== null && <div className="score">{hud.score}</div>}
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
      {hud.mode === 'won' && !winClosed && (
        <WinModal jumps={hud.jumps} destroyed={hud.destroyed} playtest={hud.playtest}
          onClose={() => { if (hud.final) setWinClosed(true); else bridge.emit(EVT.continueGame); }}
          onRetry={() => bridge.emit(EVT.restartGame)} />
      )}
    </div>
  );
}
