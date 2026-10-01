// ===== 文案 key 的类型：从 en.json 的结构推出来，写错 key 编译不过 =====
// 只依赖 JSON，谁都能 import type（type/ 层也能），不会把 i18n 运行时拖进来。
import type en from './en.json';

/** 一棵对象树的所有叶子路径：msg.fuseLit、dialogue.skeleton.0（数组下标） */
type Leaves<T, P extends string> = T extends string ? P
  : T extends readonly unknown[] ? `${P}.${number}`
  : { [K in keyof T & string]: Leaves<T[K], P extends '' ? K : `${P}.${K}`> }[keyof T & string];

/** 所有文案 key（map.* 只有中文有，不在这里） */
export type TKey = Leaves<typeof en, ''>;
/** 游戏里飘字的 key */
export type MsgKey = Extract<TKey, `msg.${string}`>;
/** 死亡原因的 key */
export type DeathKey = Extract<TKey, `death.${string}`>;
