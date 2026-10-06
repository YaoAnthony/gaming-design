// ===== 从存档接着玩的启动数据 =====
import type { Project, RunState } from '@/type';
import type { StartGameData } from '@/protocol';
import { roomKeyAt } from './WorldModel';

/** 存的层 / 房间在这份地图里找不到了，就回那一层（或第一层）的出生点 */
export function resumeData(project: Project, run: RunState): StartGameData {
  const floor = project.floors.find(f => f.id === run.floorId);
  const room = floor && run.room && roomKeyAt(floor.model, run.room.rx, run.room.ry) ? run.room : null;
  return { project, playtest: false, floorId: floor?.id, startRoom: room, stats: { ...run.stats }, stage: run.stage, carry: { ...run.carry } };
}
