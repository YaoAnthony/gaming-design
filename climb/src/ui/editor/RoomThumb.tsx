import { useEffect, useRef } from 'react';
import { classify } from '@/game/registry/registry';
import { decodeFuse, FUSE_CHANNELS, fuseBit } from '@/game/fuse/channels';

interface Props { rows: string[]; entities?: string[]; fuse?: string[]; doors?: string[]; keys?: string[]; colors?: Record<number, number>; roomW: number; roomH: number; scale?: number }

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 房间缩略图：每格一个色块，颜色来自注册表 */
export function RoomThumb({ rows, entities, fuse, doors, keys, colors, roomW, roomH, scale = 3 }: Props) {
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
    entities?.forEach((row, y) => [...row].forEach((ch, x) => {
      const cls = classify(ch);
      if (cls.kind !== 'entity') return;
      ctx.fillStyle = hex(cls.def.color);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }));
    [doors, keys].forEach(layer => layer?.forEach((row, y) => [...row].forEach((ch, x) => {
      const c = colors?.[Number(ch)];
      if (c === undefined) return;
      ctx.fillStyle = hex(c);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    })));
    // 引线画在最上面，跨房间时一眼能看出两边对不对得上
    // 按颜色画；同一格有几种颜色就竖着分成几条
    fuse?.forEach((row, y) => [...row].forEach((ch, x) => {
      const on = FUSE_CHANNELS.filter(c => decodeFuse(ch) & fuseBit(c.id));
      on.forEach((c, i) => {
        ctx.fillStyle = hex(c.color);
        ctx.fillRect(x * scale + (i * scale) / on.length, y * scale, scale / on.length, scale);
      });
    }));
  }, [rows, entities, fuse, doors, keys, colors, roomW, roomH, scale]);
  return <canvas ref={ref} width={roomW * scale} height={roomH * scale} className="thumb" />;
}
