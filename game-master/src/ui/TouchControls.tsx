import { useEffect, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { touch, TOUCH_ACTION, TOUCH_JUMP } from '@/game/input';
import { bridge } from '@/game/bridge';

interface Props { layout?: 'jump' | 'dpad' }

/** 手机端虚拟按键：左边 ▲▼◀▶，右边一个动作键。平台层动作键是跳（▲ 也能跳，▼ 放下钥匙 / 摘帽子）；俯视层动作键是放炸弹。按住即持续，松开即停 */
export function TouchControls({ layout = 'jump' }: Props) {
  const dpad = layout === 'dpad';
  const { t } = useTranslation();
  useEffect(() => () => { touch.left = false; touch.right = false; touch.up = false; touch.down = false; }, []);

  /** 手指按住按钮滑出去也算按着（指针捕获）；捕获不了（指针已经没了）不影响按键本身 */
  const capture = (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 指针已经释放 */ } };
  const hold = (key: 'left' | 'right' | 'up' | 'down') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { capture(e); touch[key] = true; },
    onPointerUp: () => { touch[key] = false; },
    onPointerCancel: () => { touch[key] = false; },
    onPointerLeave: () => { touch[key] = false; },
  });
  const action = dpad ? TOUCH_ACTION : TOUCH_JUMP;

  return (
    <div className="touch-controls">
      <div className="tc-left tc-dpad">
        {/* 平台层：▲ 也是跳（和键盘 ↑ 一样）；▼ 按一下放下钥匙 / 摘帽子。俯视层：四个方向都是走 */}
        <button className="tc-btn tc-up" {...hold('up')} onPointerDown={e => { capture(e); touch.up = true; if (!dpad) bridge.emit(TOUCH_JUMP); }} aria-label={t('touch.up')}>▲</button>
        <button className="tc-btn tc-l" {...hold('left')} aria-label={t('touch.left')}>◀</button>
        <button className="tc-btn tc-r" {...hold('right')} aria-label={t('touch.right')}>▶</button>
        <button className="tc-btn tc-down" {...hold('down')} aria-label={t('touch.down')}>▼</button>
      </div>
      <div className="tc-right">
        <button className="tc-btn tc-action" onPointerDown={e => { e.preventDefault(); bridge.emit(action); }} aria-label={t('touch.action')} />
      </div>
    </div>
  );
}
