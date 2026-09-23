import { useEffect, useRef } from 'react';
import { createGame, destroyGame, type GameMode } from '@/game/PhaserGame';
import type { StartGameData } from '@/game/bridge';

interface Props { mode: GameMode; data?: StartGameData; size?: { w: number; h: number }; onReady?: () => void }

/** 挂载一个 Phaser 实例；mode / data 变化时重建（StrictMode 下的双挂载也安全） */
export function PhaserCanvas({ mode, data, size, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = createGame(host.current, mode, data, size);
    game.events.once('ready', () => onReady?.());
    return () => destroyGame(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, data, size?.w, size?.h]);
  return <div ref={host} className="phaser-host" />;
}
