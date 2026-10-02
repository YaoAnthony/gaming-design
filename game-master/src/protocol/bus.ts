// ===== 带类型的事件总线：React、Phaser、3D 舞台之间一次性的通知和请求都走这里 =====
// 只认 events.ts 的 BridgeEvents 里的事件，emit / on 都按它检查，名字和参数对不上编译不过。
// 不依赖任何引擎：哪一侧都能用
import type { BridgeEvent, BridgeEvents } from './events';

type Handler<K extends BridgeEvent> = (...args: BridgeEvents[K]) => void;
/** 存的时候不分事件；取出来按事件的参数表调用 */
type AnyHandler = (...args: unknown[]) => void;

class Bridge {
  private readonly handlers = new Map<BridgeEvent, AnyHandler[]>();

  on<K extends BridgeEvent>(event: K, fn: Handler<K>): this {
    const list = this.handlers.get(event);
    const h = fn as AnyHandler;
    if (list) list.push(h); else this.handlers.set(event, [h]);
    return this;
  }

  off<K extends BridgeEvent>(event: K, fn: Handler<K>): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    const i = list.indexOf(fn as AnyHandler);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.handlers.delete(event);
    return this;
  }

  /** 有人听返回 true。发的过程中有人退订 / 新订，不影响这一次发给谁 */
  emit<K extends BridgeEvent>(event: K, ...args: BridgeEvents[K]): boolean {
    const list = this.handlers.get(event);
    if (!list) return false;
    for (const fn of [...list]) fn(...args);
    return true;
  }

  /** 有没有人在听这个事件（比如没挂特效层就直接做事） */
  listenerCount(event: BridgeEvent): number { return this.handlers.get(event)?.length ?? 0; }
}

export const bridge = new Bridge();
