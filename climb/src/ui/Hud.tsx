import { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';

/** 叠在画布上的 HUD：进房间时的房间名、事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
  const [msgVisible, setMsgVisible] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);

  useEffect(() => { if (!hud.message) return; setMsgVisible(true); const t = setTimeout(() => setMsgVisible(false), 1100); return () => clearTimeout(t); }, [hud.message]);
  useEffect(() => { if (!hud.roomKey) return; setRoomVisible(true); const t = setTimeout(() => setRoomVisible(false), 2600); return () => clearTimeout(t); }, [hud.roomKey, hud.roomName]);

  if (hud.mode === 'idle') return null;
  return (
    <div className="hud">
      {hud.message && <div className={'hud-msg' + (msgVisible ? ' show' : '')} style={{ color: hud.message.color }}>{hud.message.text}</div>}
      <div className={'hud-room' + (roomVisible ? ' show' : '')}>房间 {hud.roomKey}：{hud.roomName}</div>
      {hud.mode === 'won' && (
        <div className="hud-win">
          <div className="hud-win-title">到达建筑！</div>
          <div>跳跃 {hud.jumps} 次，摧毁 {hud.destroyed} 格地形{hud.playtest ? '　ESC 回编辑器' : ''}</div>
        </div>
      )}
    </div>
  );
}
