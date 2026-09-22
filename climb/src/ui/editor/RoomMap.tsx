import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addLayoutCol, addLayoutRow, setRoom, setRoomName } from '@/redux/slices/editorSlice';
import { roomKeyAt, worldCols } from '@/game/world/WorldModel';

/** 房间小地图 + 加排 / 加列 + 房间名 */
export function RoomMap() {
  const { model, room } = useAppSelector(s => s.editor);
  const dispatch = useAppDispatch();
  const key = roomKeyAt(model, room.rx, room.ry) ?? '';

  return (
    <>
      <h2>房间</h2>
      <div className="room-title">当前房间 {key}（第 {room.ry + 1} 排，第 {room.rx + 1} 列）</div>
      <div className="roommap" style={{ gridTemplateColumns: `repeat(${worldCols(model)}, 1fr)` }}>
        {model.layout.map((row, ry) => row.map((k, rx) => (
          <button key={k} className={'room' + (rx === room.rx && ry === room.ry ? ' active' : '')} title={model.names[k] ?? ''} onClick={() => dispatch(setRoom({ rx, ry }))}>{k}</button>
        )))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => dispatch(addLayoutRow())}>+ 加一排</button>
        <button className="btn" onClick={() => dispatch(addLayoutCol())}>+ 加一列</button>
      </div>
      <input type="text" value={model.names[key] ?? ''} placeholder="房间名 / 谜题提示（进房间时显示）" onChange={e => dispatch(setRoomName({ key, name: e.target.value }))} />
    </>
  );
}
