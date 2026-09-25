import { useEffect } from 'react';
import { App as AntApp, Segmented, Select } from 'antd';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { currentFloor, setPicking, setPlayLoadout } from '@/redux/slices/editorSlice';
import { getGame } from '@/game/PhaserGame';
import { bridge, EVT, SCENE, type PickedCell, type StartGameData } from '@/game/bridge';
import { Items, Tiles } from '@/game/registry/registry';
import { LOCK_COLOR_NAMES, LOCK_COLORS } from '@/game/world/WorldModel';

const STAGES = [
  { value: 0, label: '第1关', title: '1 格高' },
  { value: 1, label: '第2关', title: '1.5 格高' },
  { value: 2, label: '第3关', title: '2 格高' },
];

interface Props {
  playing: boolean;
  /** 试玩开始了（切到游戏场景之后） */
  onStart(): void;
}

/**
 * 右边栏的「试玩」：角色起始状态（第几关的身高、帽子、手上拿什么）+「从这层开始」。
 * 「从这层开始」先进入选点：在编辑器地图上点一格就从那一格开始，也可以直接从出生点开始。
 * 死亡 / 再来一次都回到这次的起点。
 */
export function PlayPanel({ playing, onStart }: Props) {
  const { project, play: loadout, picking } = useAppSelector(s => s.editor);
  const floor = useAppSelector(s => currentFloor(s.editor));
  const tile = useAppSelector(s => s.config.tile);
  const dispatch = useAppDispatch();
  const { message } = AntApp.useApp();

  // 手上能拿的：注册过的道具 + 这一层有的钥匙颜色。存的值这一层没有（比如换了层）就当空手
  const colorName = (c: number) => LOCK_COLOR_NAMES[LOCK_COLORS.indexOf(c)] ?? '';
  const heldOptions = [
    { value: '', label: '空手' },
    ...Items.list().map(d => ({ value: d.id, label: d.name })),
    ...(floor.model.locks?.groups ?? []).map(g => ({ value: 'key:' + g.id, label: colorName(g.color) + '钥匙' })),
  ];
  const held = heldOptions.some(o => o.value === loadout.held) ? loadout.held : '';

  const start = (where: Pick<StartGameData, 'startRoom' | 'entry'>) => {
    const game = getGame();
    if (!game) return;
    dispatch(setPicking(false));
    const data: StartGameData = { project, floorId: floor.id, playtest: true, stage: loadout.stage, hat: loadout.hat, held: held || undefined, ...where };
    game.scene.getScene(SCENE.editor).scene.start(SCENE.game, data);
    onStart();
  };

  // 选点中：地图上点一格就开始（实心的格子站不进去，不开始）；ESC 取消
  useEffect(() => {
    if (!picking) return;
    const onPick = (c: PickedCell) => {
      const ch = floor.model.rooms[c.key]?.[c.y]?.[c.x] ?? '.';
      if (Tiles.get(ch)?.solid) { void message.warning('那一格是实心的'); return; }
      start({ startRoom: null, entry: { x: c.wx * tile + tile / 2, y: c.wy * tile + tile / 2, vx: 0, vy: 0 } });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch(setPicking(false)); };
    bridge.on(EVT.editorPickStart, onPick);
    window.addEventListener('keydown', onKey);
    return () => { bridge.off(EVT.editorPickStart, onPick); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, project, floor, loadout, held, tile]);

  // 离开编辑器页时不要留在选点状态
  useEffect(() => () => { dispatch(setPicking(false)); }, [dispatch]);

  if (playing) {
    return (
      <>
        <h2>试玩</h2>
        <div className="row"><button className="btn primary" onClick={() => bridge.emit(EVT.requestPlaytestExit)}>◀ 返回编辑器</button></div>
        <div className="hint">也可以按 ESC。R 重置房间。</div>
      </>
    );
  }

  return (
    <>
      <h2>试玩</h2>
      <Segmented block size="small" value={loadout.stage} onChange={v => dispatch(setPlayLoadout({ stage: v as number }))}
        options={STAGES.map(s => ({ value: s.value, label: <span title={s.title}>{s.label}</span> }))} />
      <div className="row">
        <span className="hint" style={{ flex: 'none', alignSelf: 'center' }}>手上</span>
        <Select size="small" value={held} onChange={v => dispatch(setPlayLoadout({ held: v }))} options={heldOptions} />
      </div>
      <label className="check"><input type="checkbox" checked={loadout.hat} onChange={e => dispatch(setPlayLoadout({ hat: e.target.checked }))} /> 戴帽子</label>
      {picking
        ? <>
            <div className="pick-hint">点地图上一格，从那里开始</div>
            <div className="row">
              <button className="btn" onClick={() => start({ startRoom: null })}>▶ 从出生点开始</button>
              <button className="btn" onClick={() => dispatch(setPicking(false))}>取消</button>
            </div>
          </>
        : <>
            <div className="row"><button className="btn primary" onClick={() => dispatch(setPicking(true))}>▶ 从这层开始</button></div>
            <div className="hint">ESC 回编辑器，R 重置房间。</div>
          </>}
    </>
  );
}
