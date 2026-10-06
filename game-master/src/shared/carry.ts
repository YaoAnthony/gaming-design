// ===== 换层、存档带走的东西（type/save.ts 的 CarryOver）的清洗 =====
import type { CarryOver } from '@/type';

/** 只留下能存成 JSON 的值（函数、undefined、循环引用之类的去掉）；读档、换层时用 */
export function jsonCarry(v: unknown): CarryOver {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: CarryOver = {};
  for (const [k, x] of Object.entries(v)) {
    try { const s = JSON.stringify(x); if (s !== undefined) out[k] = JSON.parse(s); } catch { /* 存不成 JSON 的丢掉 */ }
  }
  return out;
}
