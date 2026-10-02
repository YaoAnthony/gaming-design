import { useCallback, useState } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { store } from '@/redux/store';
import { clearRun } from '@/redux/slices/runSlice';
import { roomKeyAt } from '@/game/world/WorldModel';
import type { Project, RunState } from '@/type';
import type { StartGameData } from '@/protocol';
import { PhaserCanvas } from './PhaserCanvas';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { useTouch } from './useTouch';
import { TitleScreen } from './TitleScreen';
import { CrumpleOverlay } from './crumple/CrumpleOverlay';
import { StageLayer } from './stage/StageLayer';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';

/** 从存档接着玩的启动数据：存的层 / 房间在这份地图里找不到了，就回那一层（或第一层）的出生点 */
function resumeData(project: Project, run: RunState): StartGameData {
  const floor = project.floors.find(f => f.id === run.floorId);
  const room = floor && run.room && roomKeyAt(floor.model, run.room.rx, run.room.ry) ? run.room : null;
  return { project, playtest: false, floorId: floor?.id, startRoom: room, stats: { ...run.stats }, stage: run.stage, hat: run.hat, held: run.held ?? undefined };
}

/** 游戏页：标题页；有存档就接着玩，没有（或点了「新游戏」）从头玩 */
export function GameView() {
  // 线上版本永远玩打包进去的地图；本地开发玩编辑器里的当前地图
  const editorProject = useAppSelector(s => s.editor.project);
  const project = import.meta.env.PROD ? DEFAULT_PROJECT : editorProject;
  const [data, setData] = useState<StartGameData | null>(null);
  const touch = useTouch();
  const controls = useAppSelector(s => s.hud.controls);

  const saved = useAppSelector(s => s.run.active);
  const size = (d: StartGameData) => roomPx((project.floors.find(f => f.id === d.floorId) ?? project.floors[0]).model);

  const start = useCallback(() => {
    const run = store.getState().run;
    setData(run.active ? resumeData(project, run) : { project, playtest: false });
  }, [project]);
  const startNew = useCallback(() => { store.dispatch(clearRun()); setData({ project, playtest: false }); }, [project]);

  return (
    <div className="view">
      <div className="stage">
        {data
          ? <><PhaserCanvas mode="game" data={data} size={size(data)} /><StageLayer /><Hud />{touch && <TouchControls layout={controls} />}<CrumpleOverlay /></>
          : <TitleScreen onStart={start} onNew={saved ? startNew : undefined} touch={touch} />}
      </div>
    </div>
  );
}
