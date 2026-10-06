import { useEffect, useRef } from 'react';
import { isAbort } from '../geometry';

/**
 * 跑一条演出的时间线（async 函数，里面用 wait(ms, signal) 等）：挂上时开始，卸下时取消（停在那一步，不再往下走）。
 * 跑完调 done。只跑一次
 */
export function useTimeline(run: (signal: AbortSignal) => Promise<void>, done: () => void): void {
  const ref = useRef({ run, done });
  ref.current = { run, done };
  useEffect(() => {
    const ac = new AbortController();
    ref.current.run(ac.signal).then(() => { if (!ac.signal.aborted) ref.current.done(); }, e => { if (!isAbort(e)) { console.error(e); ref.current.done(); } });
    return () => ac.abort();
  }, []);
}
