// ===== 运行环境：网页还是桌面版（Electron），以及按环境选好的存储后端 =====
export * from './storage';
import { detectStorage } from './storage';

/** 桌面版（Electron）：有 preload 挂的口子 */
export const isDesktop = typeof window !== 'undefined' && !!window.gameDesktop;

/** 这个环境的存储后端（Node 里是 null） */
export const storage = detectStorage();
