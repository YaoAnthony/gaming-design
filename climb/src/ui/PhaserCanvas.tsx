import { useEffect, useRef } from 'react';
import { createGame, destroyGame, type GameMode } from '@/game/PhaserGame';
import type { StartGameData } from '@/game/bridge';

interface Props { mode: GameMode; data?: StartGameData; size?: { w: number; h: number }; onReady?: () => void }

/**
 * 挂载一个 Phaser 实例；mode / data 变化时重建（StrictMode 下的双挂载也安全）。
 * size 只决定建出来时的画布大小：之后房间尺寸变了（切层、改尺寸）由场景自己 resize，
 * 不重建整个游戏（重建会重新加载所有贴图和音乐）
 */
export function PhaserCanvas({ mode, data, size, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const initialSize = useRef(size);
  initialSize.current = size;
  useEffect(() => {
    if (!host.current) return;
    const game = createGame(host.current, mode, data, initialSize.current);
    game.events.once('ready', () => onReady?.());
    return () => destroyGame(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 mode / data 变化时重建
  }, [mode, data]);
  return <div ref={host} className="phaser-host" />;
}
