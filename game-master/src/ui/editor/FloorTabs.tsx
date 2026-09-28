import { useState } from 'react';
import { App as AntApp, Input, InputNumber, Modal, Select } from 'antd';
import { ROOM_SIZE } from '@/game/world/WorldModel';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addFloor, deleteFloor, redo, renameFloor, setFloor, undo } from '@/redux/slices/editorSlice';
import { DEFAULT_FLOOR_MECHANIC, floorMechanicOf, floorMechanics } from '@/game/mechanics/define';
import { DEFAULT_MUSIC, MUSIC_TRACKS, NO_MUSIC } from '@/asset';

/** 层机制下拉：选这一层怎么玩（注册表里的层机制） */
const modeOptions = () => floorMechanics().map(m => ({ value: m.id, label: m.name, title: m.desc }));
/** 背景音乐下拉：音频清单里标了 music 的曲目 + 「无」 */
const musicOptions = [...MUSIC_TRACKS.map(a => ({ value: a.key, label: a.key === DEFAULT_MUSIC ? a.music + '（默认）' : a.music! })), { value: NO_MUSIC, label: '无（不放音乐）' }];
const LABEL = { flex: 'none', alignSelf: 'center', width: 60 } as const;

/** 层标签：每层一个独立的房间网格、可以有自己的房间尺寸。层顺序 = 游戏里的先后（小城堡去下一层） */
export function FloorTabs() {
  const { project, floor } = useAppSelector(s => s.editor);
  const canUndo = useAppSelector(s => s.editor.past.length > 0);
  const canRedo = useAppSelector(s => s.editor.future.length > 0);
  const dispatch = useAppDispatch();
  const { modal } = AntApp.useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [mode, setMode] = useState(DEFAULT_FLOOR_MECHANIC);
  const [music, setMusic] = useState(DEFAULT_MUSIC);
  const [roomW, setRoomW] = useState<number>(ROOM_SIZE.minW);
  const [roomH, setRoomH] = useState<number>(ROOM_SIZE.minH);

  const cur = project.floors[floor] ?? project.floors[0];
  const openAdd = () => { setName(`第 ${project.floors.length + 1} 层`); setPlace(''); setMode(DEFAULT_FLOOR_MECHANIC); setMusic(DEFAULT_MUSIC); setRoomW(cur.model.roomW); setRoomH(cur.model.roomH); setAdding(true); };   // 默认和当前层一样大
  const confirmAdd = () => { dispatch(addFloor({ name: name.trim(), roomW, roomH, place: place.trim(), mode, music })); setAdding(false); };

  const rename = (i: number) => {
    const f = project.floors[i];
    let v = f.name, pl = f.place ?? '', md = floorMechanicOf(f).id, mu = f.music ?? DEFAULT_MUSIC, rw = f.model.roomW, rh = f.model.roomH;
    const commit = () => dispatch(renameFloor({ index: i, name: v.trim() || f.name, place: pl.trim(), mode: md, music: mu, roomW: rw, roomH: rh }));
    // 输入框里按回车 = 点「改」。弹窗是 useApp 的 hook 弹窗，Modal.destroyAll 关不掉它，要用它自己的句柄
    const submit = () => { commit(); dialog.destroy(); };
    const dialog = modal.confirm({
      title: '这一层', icon: null, okText: '改', cancelText: '取消',
      content: (
        <>
          <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>名字</span><Input defaultValue={v} maxLength={20} onChange={e => { v = e.target.value; }} onPressEnter={submit} /></div>
          <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>位置</span><Input defaultValue={pl} maxLength={30} placeholder="左上角：当前位置: …" onChange={e => { pl = e.target.value; }} onPressEnter={submit} /></div>
          <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>玩法</span><Select style={{ flex: 1 }} defaultValue={md} options={modeOptions()} onChange={val => { md = val; }} /></div>
          <div className="row"><span className="hint" style={LABEL}>背景音乐</span><Select style={{ flex: 1 }} defaultValue={mu} options={musicOptions} onChange={val => { mu = val; }} /></div>
          <div className="row"><span className="hint" style={LABEL}>房间宽</span><InputNumber min={ROOM_SIZE.minW} max={ROOM_SIZE.maxW} precision={0} defaultValue={rw} onChange={val => { rw = val ?? rw; }} onPressEnter={submit} /></div>
          <div className="row"><span className="hint" style={LABEL}>房间高</span><InputNumber min={ROOM_SIZE.minH} max={ROOM_SIZE.maxH} precision={0} defaultValue={rh} onChange={val => { rh = val ?? rh; }} onPressEnter={submit} /></div>
          <div className="hint">房间尺寸：这一层所有房间一起改，左上角不动；变大的部分是空气，变小从右边和下边裁掉。可以撤销。</div>
        </>
      ),
      onOk: commit,
    });
  };
  const remove = (i: number) => modal.confirm({
    title: `删除「${project.floors[i].name}」？`, content: '可以撤销。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: () => dispatch(deleteFloor(i)),
  });

  return (
    <div className="floors">
      {project.floors.map((f, i) => (
        <button key={f.id} className={'floor' + (i === floor ? ' active' : '')} title={`${f.model.roomW}×${f.model.roomH}，双击改名`}
          onClick={() => dispatch(setFloor(i))} onDoubleClick={() => rename(i)}
          onContextMenu={e => { e.preventDefault(); if (project.floors.length > 1) remove(i); }}>
          {floorMechanicOf(f).id !== DEFAULT_FLOOR_MECHANIC ? '◎ ' : ''}{f.name}
        </button>
      ))}
      <button className="floor add" onClick={openAdd}>＋ 添加一层</button>
      <span className="floor-spacer" />
      <button className="floor" disabled={!canUndo} title="撤销：Ctrl(⌘)+Z" onClick={() => dispatch(undo())}>↶ 撤销</button>
      <button className="floor" disabled={!canRedo} title="重做：Ctrl(⌘)+Shift+Z" onClick={() => dispatch(redo())}>↷ 重做</button>
      <Select className="floor mode" size="small" popupMatchSelectWidth={false} title="这一层怎么玩（层机制）。没选过的话，放了哪个玩法的物件就自动是哪个"
        value={project.floors[floor] ? floorMechanicOf(project.floors[floor]).id : DEFAULT_FLOOR_MECHANIC} options={modeOptions()}
        onChange={val => dispatch(renameFloor({ index: floor, name: project.floors[floor].name, mode: val }))} />
      <button className="floor" onClick={() => rename(floor)}>层设置</button>
      <button className="floor danger" disabled={project.floors.length <= 1} onClick={() => remove(floor)}>删除本层</button>
      <Modal open={adding} title="添加一层" okText="添加" cancelText="取消" onOk={confirmAdd} onCancel={() => setAdding(false)} destroyOnHidden>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>名字</span><Input value={name} maxLength={20} onChange={e => setName(e.target.value)} onPressEnter={confirmAdd} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>位置</span><Input value={place} maxLength={30} placeholder="左上角：当前位置: …" onChange={e => setPlace(e.target.value)} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>房间宽</span><InputNumber min={ROOM_SIZE.minW} max={ROOM_SIZE.maxW} precision={0} value={roomW} onChange={v => setRoomW(v ?? roomW)} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>房间高</span><InputNumber min={ROOM_SIZE.minH} max={ROOM_SIZE.maxH} precision={0} value={roomH} onChange={v => setRoomH(v ?? roomH)} /></div>
        <div className="row"><span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>玩法</span><Select style={{ flex: 1 }} value={mode} options={modeOptions()} onChange={setMode} /></div>
        <div className="row"><span className="hint" style={LABEL}>背景音乐</span><Select style={{ flex: 1 }} value={music} options={musicOptions} onChange={setMusic} /></div>
        <div className="hint">单位：格。一层里所有房间同一个尺寸。</div>
      </Modal>
    </div>
  );
}
