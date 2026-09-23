import { useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { replaceModel, setShowSupport } from '@/redux/slices/editorSlice';
import { setConfig } from '@/redux/slices/configSlice';
import { Skills } from '@/game/registry/registry';
import '@/game/registry/skills';
import { isValidModel } from '@/game/world/WorldModel';
import type { WorldModel } from '@/type';
import { App as AntApp, Select } from 'antd';

interface Props { onPlay(fromStart: boolean): void; status: string }

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Toolbar({ onPlay, status }: Props) {
  const { model, showSupport } = useAppSelector(s => s.editor);
  const { skill, deathResetsWorld, fogEnabled, directionalBlast } = useAppSelector(s => s.config);
  const dispatch = useAppDispatch();
  const file = useRef<HTMLInputElement>(null);
  const { modal, message } = AntApp.useApp();

  /** 开发期：让 Vite 开发服务器直接把地图写进 src/map/world.json */
  const writeToSource = async () => {
    try {
      const r = await fetch('/__climb/save-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) });
      const j = (await r.json()) as { ok: boolean; file?: string; error?: string };
      if (j.ok) modal.success({ title: '写入成功', content: `地图已写入 ${j.file}`, okText: '好' });
      else modal.error({ title: '写入失败', content: j.error, okText: '好' });
    } catch (err) { modal.error({ title: '写入失败', content: (err as Error).message, okText: '好' }); }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const m: unknown = JSON.parse(await f.text());
      if (!isValidModel(m)) throw new Error('格式不对');
      dispatch(replaceModel(m as WorldModel));
    } catch (err) { void message.error('导入失败：' + (err as Error).message); }
  };

  return (
    <>
      <h2>试玩</h2>
      <div className="row"><button className="btn primary" onClick={() => onPlay(false)}>▶ 从本房间试玩</button></div>
      <div className="row"><button className="btn" onClick={() => onPlay(true)}>▶ 从出生点试玩</button></div>
      <div className="hint">试玩时 ESC 回到编辑器，R 重置房间。</div>

      <h2>游戏设置</h2>
      <div className="row">
        <span className="hint" style={{ flex: 'none', alignSelf: 'center' }}>技能</span>
        <Select size="small" value={skill} onChange={v => dispatch(setConfig({ skill: v }))} options={Skills.list().map(sk => ({ value: sk.id, label: sk.name, title: sk.desc }))} />
      </div>
      <label className="check"><input type="checkbox" checked={directionalBlast} onChange={e => dispatch(setConfig({ directionalBlast: e.target.checked }))} /> 定向爆炸（按住方向起跳，炸那边两格）</label>
      <label className="check"><input type="checkbox" checked={deathResetsWorld} onChange={e => dispatch(setConfig({ deathResetsWorld: e.target.checked }))} /> 死亡重置整张地图</label>
      <label className="check"><input type="checkbox" checked={fogEnabled} onChange={e => dispatch(setConfig({ fogEnabled: e.target.checked }))} /> 迷雾</label>

      <h2>文件</h2>
      <label className="check"><input type="checkbox" checked={showSupport} onChange={e => dispatch(setShowSupport(e.target.checked))} /> 标出会掉落的地块</label>
      {import.meta.env.DEV && (
        <>
          <div className="row"><button className="btn primary" onClick={() => void writeToSource()}>💾 写入 src/map/world.json</button></div>
        </>
      )}
      <div className="row">
        <button className="btn" onClick={() => download('world.json', JSON.stringify(model, null, 2))}>导出 world.json</button>
        <button className="btn" onClick={() => file.current?.click()}>导入 JSON</button>
      </div>
      <input ref={file} type="file" accept="application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="status">{status}</div>
    </>
  );
}
