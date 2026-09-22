import { useEffect, useState } from 'react';
import { getGame } from '@/game/PhaserGame';

/** 开发模式右上角的 FPS，读 Phaser 自己的统计 */
export function DevFps() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => { const g = getGame(); setFps(g ? Math.round(g.loop.actualFps) : null); }, 500);
    return () => clearInterval(t);
  }, []);
  if (!import.meta.env.DEV || fps === null) return null;
  return <div className="dev-fps">{fps} fps</div>;
}
