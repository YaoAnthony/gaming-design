import { App as AntApp } from 'antd';
import { IMAGES, SPRITESHEETS, TILE_SIZE } from '@/asset';
import { Entities, Tiles } from '@/game/registry/registry';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { currentModel, setBrush } from '@/redux/slices/editorSlice';
import { paletteTools } from '@/game/editor/allTools';
import type { EditorTool, ToolIcon } from '@/game/editor/tools';

const tilesUrl = SPRITESHEETS.find(s => s.key === 'tiles')!.url;
const imageUrl = (key: string) => IMAGES.find(i => i.key === key)?.url ?? '';
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 工具按钮的图标 */
function Icon({ icon }: { icon: ToolIcon }) {
  if (icon.kind === 'frame') {
    const tint = icon.tint !== undefined ? { backgroundColor: hex(icon.tint), backgroundBlendMode: 'multiply' as const } : {};
    return <div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${icon.frame * TILE_SIZE}px 0`, ...tint }} />;
  }
  if (icon.kind === 'class') return <span className={icon.className} style={{ background: hex(icon.color) }} />;
  return icon.color !== undefined ? <span className="movericon" style={{ color: hex(icon.color) }}>{icon.text}</span> : <span>{icon.text}</span>;
}

/** 物品栏里一个编辑器工具的那一组（game/editor/tools.ts 登记的：引线、移动方块、文字、钥匙与门、迷雾区……） */
function ToolSection({ tool }: { tool: EditorTool }) {
  const brush = useAppSelector(s => s.editor.brush);
  const editor = useAppSelector(s => s.editor);
  const model = useAppSelector(s => currentModel(s.editor));
  const dispatch = useAppDispatch();
  const { modal } = AntApp.useApp();
  const p = tool.palette!, add = p.add?.(model);
  return (
    <>
      <h2>{p.title}</h2>
      <div className="palette">
        {p.buttons(model, editor).map(b => (
          <button key={b.brush} className={'item' + (brush === b.brush ? ' active' : '')} title={b.title} onClick={() => dispatch(setBrush(b.brush))}>
            <div className="icon"><Icon icon={b.icon} /></div>
            <div className="label">
              <b>{b.name}</b>
              {b.remove
                ? <span className="mini" role="button" tabIndex={0} title={b.remove.title}
                  onClick={e => { e.stopPropagation(); const r = b.remove!; modal.confirm({ title: r.confirm.title, content: r.confirm.content, okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => dispatch(r.action) }); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).click(); } }}>✕</span>
                : b.sub !== undefined && <small>{b.sub}</small>}
            </div>
          </button>
        ))}
        {add && (
          <button className="item add" disabled={add.disabled} onClick={() => dispatch(add.action)}>
            <div className="icon"><span>＋</span></div>
            <div className="label"><b>{add.label}</b><small>{add.sub}</small></div>
          </button>
        )}
      </div>
      {p.toggles?.map(t => (
        <label key={t.label} className="check" title={t.title}><input type="checkbox" checked={t.checked(editor)} onChange={e => dispatch(t.action(e.target.checked))} /> {t.label}</label>
      ))}
      {p.hint && <div className="hint">{p.hint}</div>}
    </>
  );
}

/** 物品栏：从注册表生成，图标直接取自图集 / 贴图 */
export function Palette() {
  const brush = useAppSelector(s => s.editor.brush);
  const dispatch = useAppDispatch();
  const tiles = Tiles.filter(d => d.editorVisible);
  const entities = Entities.list();
  const groups = [...new Set(entities.map(e => e.group))];

  return (
    <>
      <h2>砖块</h2>
      <div className="palette">
        {tiles.map(d => (
          <button key={d.id} className={'item' + (brush === d.id ? ' active' : '')} title={d.desc} onClick={() => dispatch(setBrush(d.id))}>
            <div className="icon">
              {d.iconFrame >= 0
                ? <div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${d.iconFrame * TILE_SIZE}px 0` }} />
                : <span>⌫</span>}
            </div>
            <div className="label"><b>{d.name}</b><small>{d.id}</small></div>
          </button>
        ))}
      </div>
      {paletteTools().map(tool => <ToolSection key={tool.id} tool={tool} />)}

      {groups.map(g => (
        <div key={g}>
          <h2>{g}</h2>
          <div className="palette">
            {entities.filter(e => e.group === g).map(e => (
              <button key={e.id} className={'item' + (brush === e.id ? ' active' : '')} title={e.desc} onClick={() => dispatch(setBrush(e.id))}>
                <div className="icon"><img src={imageUrl(e.texture)} alt={e.name} /></div>
                <div className="label"><b>{e.name}</b><small>{e.id}</small></div>
              </button>
            ))}
          </div>
          {g === '吃豆人' && <div className="hint">放在「玩法」是吃豆人的层里用（层设置里选，没选过的层放了就自动是）。</div>}
        </div>
      ))}
    </>
  );
}
