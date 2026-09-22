import { useEffect, type PointerEvent } from 'react';
import { touch, TOUCH_JUMP } from '@/game/input';
import { bridge } from '@/game/bridge';

/** 手机端虚拟按键：左下 ←→，右下 跳。按住即持续，松开即停 */
export function TouchControls() {
  useEffect(() => () => { touch.left = false; touch.right = false; }, []);

  const hold = (key: 'left' | 'right') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); touch[key] = true; },
    onPointerUp: () => { touch[key] = false; },
    onPointerCancel: () => { touch[key] = false; },
    onPointerLeave: () => { touch[key] = false; },
  });

  return (
    <div className="touch-controls">
      <div className="tc-left">
        <button className="tc-btn" {...hold('left')} aria-label="左">◀</button>
        <button className="tc-btn" {...hold('right')} aria-label="右">▶</button>
      </div>
      <div className="tc-right">
        <button className="tc-btn tc-jump" onPointerDown={e => { e.preventDefault(); bridge.emit(TOUCH_JUMP); }} aria-label="跳">跳</button>
      </div>
    </div>
  );
}
