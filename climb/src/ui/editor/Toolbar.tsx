import { useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { replaceModel, resetModel, setShowSupport } from '@/redux/slices/editorSlice';
import { isValidModel } from '@/game/world/WorldModel';
import type { WorldModel } from '@/type';

interface Props { onPlay(fromStart: boolean): void; status: string }

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Toolbar({ onPlay, status }: Props) {
  const { model, showSupport } = useAppSelector(s => s.editor);
  const dispatch = useAppDispatch();
  const file = useRef<HTMLInputElement>(null);

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const m: unknown = JSON.parse(await f.text());
      if (!isValidModel(m)) throw new Error('格式不对');
      dispatch(replaceModel(m as WorldModel));
    } catch (err) { alert('导入失败：' + (err as Error).message); }
  };

  return (
    <>
      <h2>试玩</h2>
      <div className="row"><button className="btn primary" onClick={() => onPlay(false)}>▶ 从本房间试玩</button></div>
      <div className="row"><button className="btn" onClick={() => onPlay(true)}>▶ 从出生点试玩</button></div>
      <div className="hint">试玩时 ESC 回到编辑器，R 重置房间。</div>

      <h2>文件</h2>
      <label className="check"><input type="checkbox" checked={showSupport} onChange={e => dispatch(setShowSupport(e.target.checked))} /> 标出会掉落的地块</label>
      <div className="row">
        <button className="btn" onClick={() => download('world.json', JSON.stringify(model, null, 2))}>导出 world.json</button>
        <button className="btn" onClick={() => file.current?.click()}>导入 JSON</button>
      </div>
      <input ref={file} type="file" accept="application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="row">
        <button className="btn" onClick={() => { if (confirm('恢复成默认地图？当前编辑内容会丢失。')) dispatch(resetModel()); }}>恢复默认地图</button>
      </div>
      <div className="hint">改动自动存在浏览器里。导出的 world.json 覆盖到 src/map/ 就是新的默认地图。</div>
      <div className="status">{status}</div>
    </>
  );
}
