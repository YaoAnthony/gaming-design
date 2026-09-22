// ===== 到达终点的庆祝：motion 驱动的彩纸爆炸 + 弹性标题 =====
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

interface Props { title: string; subtitle?: string; pieces?: number }

export function Celebration({ title, subtitle, pieces = 90 }: Props) {
  const items = useMemo(() => makePieces(pieces), [pieces]);
  return (
    <div className="celebration">
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
      <motion.div className="celebration-card" initial={{ scale: 0.4, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}>
        <motion.div className="celebration-title" animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>{title}</motion.div>
        {subtitle && <div className="celebration-sub">{subtitle}</div>}
      </motion.div>
    </div>
  );
}
