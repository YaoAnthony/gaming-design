import { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { Celebration } from './Celebration';
import { bridge, EVT } from '@/game/bridge';
import { AVATARS } from '@/asset';

/** 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
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
      {hud.message && <div className={'hud-msg' + (msgVisible ? ' show' : '')} style={{ color: hud.message.color }}>{hud.message.text}</div>}
      {hud.mode === 'playing' && hud.dialogue && (
        <div className="dialogue">
          {hud.dialogue.avatar && AVATARS[hud.dialogue.avatar] && <img className="dialogue-avatar" src={AVATARS[hud.dialogue.avatar]} alt="" />}
          <div className="dialogue-body">
            <div className="dialogue-name">{hud.dialogue.speaker}</div>
            <div className="dialogue-text">{hud.dialogue.text}</div>
            <div className="dialogue-hint">▸</div>
          </div>
        </div>
      )}
      {hud.mode === 'dead' && (
        <div className="death" onPointerDown={() => bridge.emit(EVT.requestReset)}>
          <div className="death-title">U DEAD</div>
          <div className="death-sub">按 R 重来</div>
        </div>
      )}
      {hud.mode === 'won' && (
        <div className="won" onPointerDown={() => { if (!hud.final) bridge.emit(EVT.continueGame); }}>
          <Celebration title="通关！" subtitle={`跳跃 ${hud.jumps} 次，摧毁 ${hud.destroyed} 格地形${hud.final ? '' : '　跳一下继续'}${hud.playtest ? '　ESC 回编辑器' : ''}`} />
        </div>
      )}
    </div>
  );
}
