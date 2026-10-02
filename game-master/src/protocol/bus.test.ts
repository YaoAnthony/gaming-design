import { describe, expect, it, vi } from 'vitest';
import { bridge } from './bus';
import { EVT } from './events';

describe('事件总线', () => {
  it('发给所有在听的，带上参数；没人听返回 false', () => {
    const a = vi.fn(), b = vi.fn();
    expect(bridge.emit(EVT.crumpleDone, { fadeMs: 1 })).toBe(false);
    bridge.on(EVT.crumpleDone, a).on(EVT.crumpleDone, b);
    expect(bridge.listenerCount(EVT.crumpleDone)).toBe(2);
    expect(bridge.emit(EVT.crumpleDone, { fadeMs: 500 })).toBe(true);
    expect(a).toHaveBeenCalledWith({ fadeMs: 500 });
    expect(b).toHaveBeenCalledTimes(1);
    bridge.off(EVT.crumpleDone, a).off(EVT.crumpleDone, b);
    expect(bridge.listenerCount(EVT.crumpleDone)).toBe(0);
  });

  it('发的过程中退订，不影响这一次发给谁', () => {
    const second = vi.fn();
    const first = () => { bridge.off(EVT.requestReset, second); };
    bridge.on(EVT.requestReset, first).on(EVT.requestReset, second);
    bridge.emit(EVT.requestReset);
    expect(second).toHaveBeenCalledTimes(1);
    bridge.emit(EVT.requestReset);
    expect(second).toHaveBeenCalledTimes(1);
    bridge.off(EVT.requestReset, first);
  });
});
