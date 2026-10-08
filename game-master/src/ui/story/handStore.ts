// ===== 现在该画哪只手：每个 GmHand 组件把自己的状态登记到这，GmHandLayer 的 3D 画布画最后登记的那一只 =====
// 开场、菜单、演出各自渲染一个 GmHand，但同一时刻只有一只手在画面上；谁最后给了非空状态，画谁。
import { useSyncExternalStore } from 'react';
import type { HandState } from './handState';

let nextId = 0, seq = 0;
const entries = new Map<number, { state: HandState; seq: number }>();
let current: HandState | null = null;
const subs = new Set<() => void>();

export const newHandId = (): number => ++nextId;

/** 登记（state）或注销（null）一只手 */
export function publishHand(id: number, state: HandState | null): void {
  if (state) entries.set(id, { state, seq: ++seq });
  else entries.delete(id);
  let best: { state: HandState; seq: number } | undefined;
  for (const e of entries.values()) if (!best || e.seq > best.seq) best = e;
  current = best?.state ?? null;
  subs.forEach(f => f());
}

export const currentHand = (): HandState | null => current;

export function subscribeHand(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// 3D 画布能不能用：GmHandLayer 建好画布后告诉大家；建不起来（没有 WebGL）GmHand 退回 PNG 精灵。null = 还不知道
let supported: boolean | null = null;
const supportSubs = new Set<() => void>();

export function setHand3dSupported(v: boolean | null): void {
  supported = v;
  supportSubs.forEach(f => f());
}

export function useHand3dSupported(): boolean | null {
  return useSyncExternalStore(fn => { supportSubs.add(fn); return () => { supportSubs.delete(fn); }; }, () => supported);
}
