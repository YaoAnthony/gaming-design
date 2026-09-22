import { useState, type DragEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addRoom, deleteRoom, moveRoom, setRoom, setRoomFlag } from '@/redux/slices/editorSlice';
import { roomKeyAt, worldCols, worldRowsCount } from '@/game/world/WorldModel';
import type { RoomCoord } from '@/type';
import { App as AntApp } from 'antd';
import { RoomThumb } from './RoomThumb';

/** 房间布局：缩略图网格，四周多一圈空位可以加房间；拖拽交换 / 移动 */
export function RoomMap() {
  const { model, room } = useAppSelector(s => s.editor);
  const dispatch = useAppDispatch();
  const { modal } = AntApp.useApp();
  const [dragging, setDragging] = useState<RoomCoord | null>(null);
  const key = roomKeyAt(model, room.rx, room.ry);
  const cols = worldCols(model), rows = worldRowsCount(model);

  const onDragStart = (rc: RoomCoord) => (e: DragEvent) => { e.dataTransfer.setData('text/plain', `${rc.rx},${rc.ry}`); e.dataTransfer.effectAllowed = 'move'; setDragging(rc); };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (to: RoomCoord) => (e: DragEvent) => {
    e.preventDefault();
    const [rx, ry] = e.dataTransfer.getData('text/plain').split(',').map(Number);
    setDragging(null);
    if (Number.isNaN(rx) || (rx === to.rx && ry === to.ry)) return;
    dispatch(moveRoom({ from: { rx, ry }, to }));
  };

  // 网格比布局大一圈：外圈 = 可以向外扩展的位置
  const cells: JSX.Element[] = [];
  for (let gy = -1; gy <= rows; gy++) {
    for (let gx = -1; gx <= cols; gx++) {
      const rc = { rx: gx, ry: gy };
      const k = roomKeyAt(model, gx, gy);
      const ring = gx < 0 || gy < 0 || gx >= cols || gy >= rows;
      if (k) {
        const active = gx === room.rx && gy === room.ry;
        cells.push(
          <div key={`r${gx},${gy}`} className={'room-thumb' + (active ? ' active' : '') + (dragging && dragging.rx === gx && dragging.ry === gy ? ' dragging' : '')}
            title={k} draggable onDragStart={onDragStart(rc)} onDragEnd={() => setDragging(null)} onDragOver={onDragOver} onDrop={onDrop(rc)}
            onClick={() => dispatch(setRoom(rc))}>
            <RoomThumb rows={model.rooms[k]} fuse={model.fuse?.[k]} roomW={model.roomW} roomH={model.roomH} />
            <span className="room-key">{k}</span>
          </div>,
        );
      } else {
        cells.push(
          <button key={`e${gx},${gy}`} className={'room-add' + (ring ? ' ring' : '')} title="在这里加一个房间"
            onDragOver={onDragOver} onDrop={onDrop(rc)} onClick={() => dispatch(addRoom(rc))}>+</button>,
        );
      }
    }
  }

  return (
    <>
      <h2>房间</h2>
      <div className="room-title">{key ? `当前房间 ${key}（第 ${room.ry + 1} 排，第 ${room.rx + 1} 列）` : '没有选中房间'}</div>
      <div className="roommap" style={{ gridTemplateColumns: `repeat(${cols + 2}, 1fr)` }}>{cells}</div>
      <div className="hint">点击选择，拖动交换或挪到空位，「+」在那个位置新建房间。空位在游戏里是实心岩石。</div>
      {key && (
        <>
          <label className="check"><input type="checkbox" checked={!!model.roomFlags?.[key]?.noFog} onChange={e => dispatch(setRoomFlag({ key, flags: { noFog: e.target.checked } }))} /> 这个房间不要迷雾</label>
          <div className="row">
            <button className="btn danger" onClick={() => modal.confirm({
              title: `删除房间 ${key}？`,
              content: '不能撤销。',
              okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
              onOk: () => dispatch(deleteRoom(key)),
            })}>删除房间 {key}</button>
          </div>
        </>
      )}
    </>
  );
}
