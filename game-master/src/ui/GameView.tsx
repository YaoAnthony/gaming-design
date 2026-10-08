import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { bridge, EVT, type StartGameData } from '@/protocol';
import { isDesktop } from '@/platform';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { useTouch } from './useTouch';
import { CrumpleOverlay } from './crumple/CrumpleOverlay';
import { StageLayer } from './stage/StageLayer';
import { StoryLayer } from './story/StoryLayer';
import { AudioGate } from './story/AudioGate';
import { PauseMenu } from './PauseMenu';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';

/** 网页刚打开、玩家还没按过任何键：浏览器不让出声，先显示「按任意键」 */
const needsGesture = () => !isDesktop && typeof navigator !== 'undefined' && !(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;

/**
 * 游戏页：一打开就是标题画面——第一层出生房间和菜单直接显示，木手只指向 UI（剧情机制 + StoryLayer）。
 * 菜单看有没有存档：有就多一项「继续游戏」（回到存档的房间）；「开始游戏」从第一层开始。结局画面选「退出」回到这里重来一遍标题画面
 */
export function GameView() {
  // 线上版本永远玩打包进去的地图；本地开发玩编辑器里的当前地图
  const editorProject = useAppSelector(s => s.editor.project);
  const project = import.meta.env.PROD ? DEFAULT_PROJECT : editorProject;
  const [data, setData] = useState<StartGameData | null>(null);
  const [gate, setGate] = useState(needsGesture);
  const touch = useTouch();
  const controls = useAppSelector(s => s.hud.controls);
  const size = (d: StartGameData) => roomPx((project.floors.find(f => f.id === d.floorId) ?? project.floors[0]).model);

  const openTitle = useCallback(() => setData({ project, playtest: false, opening: true }), [project]);
  useEffect(() => { if (!gate && !data) openTitle(); }, [gate, data, openTitle]);
  useEffect(() => {
    const toTitle = () => setData(null);   // 下一帧重新起标题画面
    bridge.on(EVT.toTitle, toTitle);
    return () => { bridge.off(EVT.toTitle, toTitle); };
  }, []);

  return (
    <div className="view">
      <div className="stage">
        {gate && <AudioGate onGo={() => setGate(false)} />}
        {data && <><PhaserCanvas mode="game" data={data} size={size(data)} /><StageLayer /><StoryLayer /><Hud />{touch && <TouchControls layout={controls} />}<CrumpleOverlay /><PauseMenu /></>}
      </div>
    </div>
  );
}
