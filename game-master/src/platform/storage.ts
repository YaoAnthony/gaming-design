// ===== 存储后端：游戏只说「读 / 写某一份」，存在哪由运行环境决定 =====
// - 浏览器（网页版、开发服务器）：localStorage，一份一个 key
// - 桌面版（Electron）：preload 暴露的 window.gameDesktop.save，主进程写成用户数据目录下的 <名字>.json。
//   Steam 的自动云同步（Auto-Cloud）只要指向那个目录就能同步存档，不用接 SDK，见 docs/desktop.md
// 不依赖任何引擎；Redux（redux/persist.ts）是唯一的调用方。

/**
 * 存哪几份：
 * - save：玩家的东西（进度 + 自己的设置），很小，桌面版同步到 Steam 云
 * - editor：开发期地图编辑器的工作区（整个项目），只在开发版用，不同步
 */
export type SaveName = 'save' | 'editor';

export interface SaveStorage {
  /** browser = localStorage；desktop = Electron 写文件 */
  readonly kind: 'browser' | 'desktop';
  /** 读这一份的原文；没有 / 读不出来是 null */
  read(name: SaveName): string | null;
  /** 写这一份（同步写完，关窗口前最后一次写也不会丢） */
  write(name: SaveName, text: string): void;
}

/** Electron 的 preload 挂在 window 上的口子（electron/preload.cjs） */
export interface DesktopBridge {
  save: { read(name: SaveName): string | null; write(name: SaveName, text: string): void };
  /** 切换全屏 */
  toggleFullscreen(): void;
  quit(): void;
}

declare global {
  interface Window { gameDesktop?: DesktopBridge }
}

/** localStorage 里每一份的 key */
export const BROWSER_KEYS: Record<SaveName, string> = { save: 'climb:save', editor: 'climb:editor' };

export function browserStorage(ls: Pick<Storage, 'getItem' | 'setItem'>): SaveStorage {
  return {
    kind: 'browser',
    read: name => { try { return ls.getItem(BROWSER_KEYS[name]); } catch { return null; } },
    write: (name, text) => { try { ls.setItem(BROWSER_KEYS[name], text); } catch { /* 隐私模式、存满了 */ } },
  };
}

export function desktopStorage(bridge: DesktopBridge): SaveStorage {
  return {
    kind: 'desktop',
    read: name => { try { return bridge.save.read(name); } catch { return null; } },
    write: (name, text) => { try { bridge.save.write(name, text); } catch { /* 主进程写失败：下次检查点再写 */ } },
  };
}

/** 现在这个环境用哪个后端；Node 里（测试）没有 window，返回 null */
export function detectStorage(): SaveStorage | null {
  if (typeof window === 'undefined') return null;
  if (window.gameDesktop) return desktopStorage(window.gameDesktop);
  return typeof localStorage === 'undefined' ? null : browserStorage(localStorage);
}
