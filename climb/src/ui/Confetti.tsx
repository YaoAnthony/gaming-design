// ===== 通关礼花：motion 驱动的彩纸爆炸（从画面下方往上喷，再落下淡出） =====
import { useMemo } from 'react';
import { motion } from 'motion/react';

const COLORS = ['#ffd166', '#4cc9f0', '#ef476f', '#06d6a0', '#9b5de5', '#ff9f1c', '#ffffff'];

interface Piece { id: number; x: number; y: number; rot: number; color: string; size: number; delay: number; duration: number; shape: 'rect' | 'dot' }

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;   // 以向上为中心的扇形
    const power = 260 + Math.random() * 420;
    return {
      id,
      x: Math.cos(angle) * power,
      y: Math.sin(angle) * power + 380 + Math.random() * 200,               // 先冲上去再落下
      rot: (Math.random() - 0.5) * 1440,
      color: COLORS[id % COLORS.length],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.15,
      duration: 1.6 + Math.random() * 0.9,
      shape: Math.random() < 0.7 ? 'rect' : 'dot',
    };
  });
}

export function Confetti({ pieces = 90 }: { pieces?: number }) {
  const items = useMemo(() => makePieces(pieces), [pieces]);
  return (
    <div className="confetti-layer" aria-hidden="true">
      <div className="confetti">
        {items.map(p => (
          <motion.span
            key={p.id}
            className={'confetti-piece ' + p.shape}
            style={{ background: p.color, width: p.size, height: p.shape === 'dot' ? p.size : p.size * 0.5 }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: [0, -Math.abs(p.y) * 0.45, p.y], rotate: p.rot, opacity: [1, 1, 0], scale: [1, 1.1, 0.6] }}
            transition={{ duration: p.duration, delay: p.delay, ease: ['easeOut', 'easeIn'], times: [0, 0.35, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
