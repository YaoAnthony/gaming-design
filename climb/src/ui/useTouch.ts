import { useEffect, useState } from 'react';
import { isTouchDevice } from '@/game/input';

/** 是不是触屏：先按设备特征判断，之后只要收到一次真实的触摸事件就确定是 */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(isTouchDevice);
  useEffect(() => {
    if (touch) return;
    const on = () => setTouch(true);
    window.addEventListener('touchstart', on, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', on);
  }, [touch]);
  return touch;
}
