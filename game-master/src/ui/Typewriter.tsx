import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { growParts, TYPE_CPS } from '@/protocol/typing';

interface Props { text: string; /** 每秒几个字 */ cps?: number; /** 越说越大：text 用 | 分成几截，一截比一截大 */ grow?: boolean }

/** 越说越大时：每一截比前一截大多少倍（打字速度在 protocol/typing.ts） */
const GROW = { step: 1.55 };

/** 一截字：打到第 start 个字之后才开始出来 */
function Segment({ count, text, start, scale }: { count: MotionValue<number>; text: string; start: number; scale: number }) {
  const shown = useTransform(count, v => text.slice(0, Math.max(0, Math.round(v) - start)));
  return <motion.span style={{ fontSize: `${scale}em` }}>{shown}</motion.span>;
}

/** 打字机：文字一个个出来，没有末尾的光标。text 变了就从头打 */
export function Typewriter({ text, cps = TYPE_CPS.normal, grow = false }: Props) {
  const parts = grow ? growParts(text) : [text];
  const total = parts.reduce((n, p) => n + p.length, 0), speed = grow ? TYPE_CPS.grow : cps;
  const count = useMotionValue(0);
  useEffect(() => {
    count.set(0);
    const ctrl = animate(count, total, { duration: total / speed, ease: 'linear' });
    return () => ctrl.stop();
  }, [text, total, speed, count]);
  let start = 0;
  return <>{parts.map((p, i) => { const at = start; start += p.length; return <Segment key={i} count={count} text={p} start={at} scale={GROW.step ** i} />; })}</>;
}
