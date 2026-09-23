import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';

interface Props { text: string; /** 每秒几个字 */ cps?: number }

/** 打字机：文字一个个出来，没有末尾的光标。text 变了就从头打 */
export function Typewriter({ text, cps = 28 }: Props) {
  const count = useMotionValue(0);
  const shown = useTransform(count, v => text.slice(0, Math.round(v)));
  useEffect(() => {
    count.set(0);
    const ctrl = animate(count, text.length, { duration: text.length / cps, ease: 'linear' });
    return () => ctrl.stop();
  }, [text, cps, count]);
  return <motion.span>{shown}</motion.span>;
}
