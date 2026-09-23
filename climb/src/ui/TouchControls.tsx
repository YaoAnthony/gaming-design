import { useEffect, type PointerEvent } from 'react';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/game/input';
import { bridge } from '@/game/bridge';

interface Props { topdown?: boolean }

/** 手机端虚拟按键：平台层 ←→ + 一个动作键（跳）；俯视层 ▲▼◀▶ + 一个动作键（炸弹）。按住即持续，松开即停 */
export function TouchControls({ topdown = false }: Props) {
  useEffect(() => () => { touch.left = false; touch.right = false; touch.up = false; touch.down = false; }, []);

  const hold = (key: 'left' | 'right' | 'up' | 'down') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); touch[key] = true; },
    onPointerUp: () => { touch[key] = false; },
    onPointerCancel: () => { touch[key] = false; },
    onPointerLeave: () => { touch[key] = false; },
  });
  const action = topdown ? TOUCH_ACTION : TOUCH_JUMP;

  return (
    <div className="touch-controls">
      {topdown ? (
        <div className="tc-left tc-dpad">
          <button className="tc-btn tc-up" {...hold('up')} aria-label="上">▲</button>
          <button className="tc-btn tc-l" {...hold('left')} aria-label="左">◀</button>
          <button className="tc-btn tc-r" {...hold('right')} aria-label="右">▶</button>
          <button className="tc-btn tc-down" {...hold('down')} aria-label="下">▼</button>
        </div>
      ) : (
        <div className="tc-left">
          <button className="tc-btn" {...hold('left')} aria-label="左">◀</button>
          <button className="tc-btn" {...hold('right')} aria-label="右">▶</button>
        </div>
      )}
      <div className="tc-right">
        <button className="tc-btn tc-action" onPointerDown={e => { e.preventDefault(); bridge.emit(action); }} aria-label="动作" />
      </div>
    </div>
  );
}
