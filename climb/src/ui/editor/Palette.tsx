import { IMAGES, SPRITESHEETS, TILE_SIZE } from '@/asset';
import { Entities, Tiles } from '@/game/registry/registry';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setBrush } from '@/redux/slices/editorSlice';

const tilesUrl = SPRITESHEETS.find(s => s.key === 'tiles')!.url;
const imageUrl = (key: string) => IMAGES.find(i => i.key === key)?.url ?? '';

/** 物品栏：从注册表生成，图标直接取自图集 / 贴图 */
export function Palette() {
  const brush = useAppSelector(s => s.editor.brush);
  const dispatch = useAppDispatch();
  const tiles = Tiles.filter(d => d.editorVisible);
  const entities = Entities.list();

  return (
    <>
      <h2>砖块</h2>
      <div className="palette">
        {tiles.map(d => (
          <button key={d.id} className={'item' + (brush === d.id ? ' active' : '')} title={d.desc} onClick={() => dispatch(setBrush(d.id))}>
            <div className="icon">
              {d.frame >= 0
                ? <div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${d.frame * TILE_SIZE}px 0` }} />
                : <span>⌫</span>}
            </div>
            <div className="label"><b>{d.name}</b><small>{d.id}</small></div>
          </button>
        ))}
      </div>
      <h2>物件</h2>
      <div className="palette">
        {entities.map(e => (
          <button key={e.id} className={'item' + (brush === e.id ? ' active' : '')} title={e.desc} onClick={() => dispatch(setBrush(e.id))}>
            <div className="icon"><img src={imageUrl(e.texture)} alt={e.name} /></div>
            <div className="label"><b>{e.name}</b><small>{e.id}</small></div>
          </button>
        ))}
      </div>
    </>
  );
}
