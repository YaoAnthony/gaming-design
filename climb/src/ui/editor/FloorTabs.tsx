import { useState } from 'react';
import { App as AntApp, Input, InputNumber, Modal } from 'antd';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addFloor, deleteFloor, renameFloor, setFloor } from '@/redux/slices/editorSlice';

/** 层标签：第一层在塔外，进塔之后每层一个独立的房间网格、可以有自己的房间尺寸 */
export function FloorTabs() {
  const { project, floor } = useAppSelector(s => s.editor);
  const dispatch = useAppDispatch();
  const { modal } = AntApp.useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [roomW, setRoomW] = useState(20);
  const [roomH, setRoomH] = useState(20);

  const openAdd = () => { setName(`第 ${project.floors.length + 1} 层`); setRoomW(20); setRoomH(20); setAdding(true); };
  const confirmAdd = () => { dispatch(addFloor({ name: name.trim(), roomW, roomH })); setAdding(false); };

  const rename = (i: number) => {
    let v = project.floors[i].name;
    modal.confirm({
      title: '层名', icon: null, okText: '改', cancelText: '取消',
      content: <Input defaultValue={v} maxLength={20} onChange={e => { v = e.target.value; }} onPressEnter={() => { dispatch(renameFloor({ index: i, name: v.trim() || project.floors[i].name })); Modal.destroyAll(); }} />,
      onOk: () => dispatch(renameFloor({ index: i, name: v.trim() || project.floors[i].name })),
    });
  };
  const remove = (i: number) => modal.confirm({
    title: `删除「${project.floors[i].name}」？`, content: '不能撤销。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: () => dispatch(deleteFloor(i)),
  });

  return (
    <div className="floors">
      {project.floors.map((f, i) => (
        <button key={f.id} className={'floor' + (i === floor ? ' active' : '')} title={`${f.model.roomW}×${f.model.roomH}，双击改名`}
          onClick={() => dispatch(setFloor(i))} onDoubleClick={() => rename(i)}
          onContextMenu={e => { e.preventDefault(); if (project.floors.length > 1) remove(i); }}>
          {f.name}
        </button>
      ))}
      <button className="floor add" onClick={openAdd}>＋ 添加一层</button>
      <span className="floor-spacer" />
      <button className="floor" onClick={() => rename(floor)}>改名</button>
      <button className="floor danger" disabled={project.floors.length <= 1} onClick={() => remove(floor)}>删除本层</button>
      <Modal open={adding} title="添加一层" okText="添加" cancelText="取消" onOk={confirmAdd} onCancel={() => setAdding(false)} destroyOnHidden>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>名字</span><Input value={name} maxLength={20} onChange={e => setName(e.target.value)} onPressEnter={confirmAdd} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>房间宽</span><InputNumber min={10} max={80} value={roomW} onChange={v => setRoomW(v ?? 20)} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>房间高</span><InputNumber min={10} max={60} value={roomH} onChange={v => setRoomH(v ?? 20)} /></div>
        <div className="hint">单位：格。一层里所有房间同一个尺寸。</div>
      </Modal>
    </div>
  );
}
