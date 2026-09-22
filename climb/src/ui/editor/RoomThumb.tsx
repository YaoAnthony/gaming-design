import { useEffect, useRef } from 'react';
import { classify } from '@/game/registry/registry';

interface Props { rows: string[]; fuse?: string[]; roomW: number; roomH: number; scale?: number }

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 房间缩略图：每格一个色块，颜色来自注册表 */
export function RoomThumb({ rows, fuse, roomW, roomH, scale = 3 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, roomW * scale, roomH * scale);
    ctx.fillStyle = '#141a2c'; ctx.fillRect(0, 0, roomW * scale, roomH * scale);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const cls = classify(ch);
      if (cls.kind === 'tile' && cls.def.id === '.') return;
      ctx.fillStyle = hex(cls.def.color);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }));
    // 引线画在最上面，跨房间时一眼能看出两边对不对得上
    fuse?.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== 'W') return;
      ctx.fillStyle = '#ff7b54';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }));
  }, [rows, fuse, roomW, roomH, scale]);
  return <canvas ref={ref} width={roomW * scale} height={roomH * scale} className="thumb" />;
}
