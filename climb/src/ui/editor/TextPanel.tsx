import { Input, Select } from 'antd';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { currentModel, removeText, updateText } from '@/redux/slices/editorSlice';
import { roomKeyAt } from '@/game/world/WorldModel';
import { FONT_CHARS, textSize } from '@/game/world/font';
import { Tiles } from '@/game/registry/registry';

/** 当前房间里的文字方块：改内容 / 用哪种砖 / 炸完跳到哪层 */
export function TextPanel() {
  const { project, room, brush } = useAppSelector(s => s.editor);
  const model = useAppSelector(s => currentModel(s.editor));
  const dispatch = useAppDispatch();
  const key = roomKeyAt(model, room.rx, room.ry);
  const blocks = key ? model.texts?.[key] ?? [] : [];
  if (!key || (blocks.length === 0 && brush !== 'text')) return null;
  const tiles = Tiles.filter(d => d.editorVisible && d.destructible);
  const floors = project.floors.map(f => ({ value: f.id, label: f.name }));
  const allowed = new RegExp(`[^${FONT_CHARS.replace(/[-\]\\^]/g, '\\$&')} \\n]`, 'g');

  return (
    <>
      <h2>文字方块</h2>
      {blocks.length === 0 && <div className="hint">左键点画布放一串字。</div>}
      {blocks.map(b => {
        const sz = textSize(b.text);
        return (
          <div className="textblock" key={b.id}>
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} value={b.text} maxLength={60}
              onChange={e => dispatch(updateText({ key, id: b.id, patch: { text: e.target.value.toUpperCase().replace(allowed, '') } }))} />
            <div className="row">
              <Select size="small" value={b.tile} onChange={v => dispatch(updateText({ key, id: b.id, patch: { tile: v } }))} options={tiles.map(t => ({ value: t.id, label: t.name }))} />
              <Select size="small" value={b.target} placeholder="跳到" onChange={v => dispatch(updateText({ key, id: b.id, patch: { target: v } }))} options={floors} status={floors.some(f => f.value === b.target) ? undefined : 'error'} />
              <button className="btn" style={{ flex: 'none' }} onClick={() => dispatch(removeText({ key, id: b.id }))}>✕</button>
            </div>
            <div className="hint">({b.x}, {b.y})　{sz.w}×{sz.h} 格　全炸完 → 跳层</div>
          </div>
        );
      })}
    </>
  );
}
