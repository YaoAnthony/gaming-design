import { useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { Celebration } from './Celebration';

/** 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条） */
export function Hud() {
  const hud = useAppSelector(s => s.hud);
  const [msgVisible, setMsgVisible] = useState(false);

  useEffect(() => { if (!hud.message) return; setMsgVisible(true); const t = setTimeout(() => setMsgVisible(false), 1100); return () => clearTimeout(t); }, [hud.message]);

  if (hud.mode === 'idle') return null;
  return (
    <div className="hud">
      {hud.message && <div className={'hud-msg' + (msgVisible ? ' show' : '')} style={{ color: hud.message.color }}>{hud.message.text}</div>}
      {hud.mode === 'won' && (
        <Celebration title="到达建筑！" subtitle={`跳跃 ${hud.jumps} 次，摧毁 ${hud.destroyed} 格地形${hud.playtest ? '　ESC 回编辑器' : ''}`} />
      )}
    </div>
  );
}
