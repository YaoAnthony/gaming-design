import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { roomKeyAt } from '@/game/world/WorldModel';
import type { Project, RunState } from '@/type';
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
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';

/** 从存档接着玩的启动数据：存的层 / 房间在这份地图里找不到了，就回那一层（或第一层）的出生点 */
function resumeData(project: Project, run: RunState): StartGameData {
  const floor = project.floors.find(f => f.id === run.floorId);
  const room = floor && run.room && roomKeyAt(floor.model, run.room.rx, run.room.ry) ? run.room : null;
  return { project, playtest: false, floorId: floor?.id, startRoom: room, stats: { ...run.stats }, stage: run.stage, carry: { ...run.carry } };
}

/** 网页刚打开、玩家还没按过任何键：浏览器不让出声，先显示「按任意键」 */
const needsGesture = () => !isDesktop && typeof navigator !== 'undefined' && !(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;

/**
 * 游戏页：一打开就是标题画面——游戏场景直接起来（有存档就是存档的那个房间），骷髅手先把房间搭出来、拍菜单（剧情机制 + StoryLayer），
 * 选「开始」主角出场。结局画面选「退出」回到这里重来一遍标题画面
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

  const openTitle = useCallback(() => {
    const run = store.getState().run;
    setData({ ...(run.active ? resumeData(project, run) : { project, playtest: false }), opening: true });
  }, [project]);
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
        {data && <><PhaserCanvas mode="game" data={data} size={size(data)} /><StageLayer /><StoryLayer /><Hud />{touch && <TouchControls layout={controls} />}<CrumpleOverlay /></>}
      </div>
    </div>
  );
}
