import { IMAGES, SPRITESHEETS, TILE_FRAMES, TILE_SIZE } from '@/asset';
import { Entities, Tiles } from '@/game/registry/registry';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addLock, currentModel, removeLock, setBrush } from '@/redux/slices/editorSlice';
import { LOCK_COLOR_NAMES, LOCK_COLORS } from '@/game/world/WorldModel';
import { FOG_ZONES, FOG_ZONE_COLORS, fogBrush } from './fogZones';

const tilesUrl = SPRITESHEETS.find(s => s.key === 'tiles')!.url;
const imageUrl = (key: string) => IMAGES.find(i => i.key === key)?.url ?? '';

/** 物品栏：从注册表生成，图标直接取自图集 / 贴图 */
export function Palette() {
  const brush = useAppSelector(s => s.editor.brush);
  const locks = useAppSelector(s => currentModel(s.editor).locks);
  const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
  const colorName = (c: number) => LOCK_COLOR_NAMES[LOCK_COLORS.indexOf(c)] ?? '';
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
      <h2>引线</h2>
      <div className="palette">
        <button className={'item' + (brush === 'fuse' ? ' active' : '')} title="叠在砖块上的一条线，不占格子。只有两端能被爆炸点燃，然后一格格烧到另一头，烧到哪格炸哪格，岩石也炸；游戏里只看得见端点" onClick={() => dispatch(setBrush('fuse'))}>
          <div className="icon"><div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${(TILE_FRAMES.fuse + 6) * TILE_SIZE}px 0` }} /></div>
          <div className="label"><b>引线</b><small>右键擦除</small></div>
        </button>
      </div>
      <div className="hint">引线可以穿过空气和任何砖块，不改变地形。经过空气就只是过一下。</div>

      <h2>文字</h2>
      <div className="palette">
        <button className={'item' + (brush === 'text' ? ' active' : '')} title="一串字，每个字母由可炸的砖拼成；全炸完就跳到指定的层。右键删除" onClick={() => dispatch(setBrush('text'))}>
          <div className="icon"><div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${TILE_FRAMES.letter * TILE_SIZE}px 0` }} /></div>
          <div className="label"><b>文字方块</b><small>text</small></div>
        </button>
      </div>

      <h2>钥匙与门</h2>
      <div className="palette">
        {(locks?.groups ?? []).flatMap(g => [
          <button key={'k' + g.id} className={'item' + (brush === 'key:' + g.id ? ' active' : '')} title={`${colorName(g.color)}钥匙：捡到后碰同色的门就开`} onClick={() => dispatch(setBrush('key:' + g.id))}>
            <div className="icon"><span className="keyicon" style={{ background: hex(g.color) }} /></div>
            <div className="label"><b>{colorName(g.color)}钥匙</b><small>{g.id}</small></div>
          </button>,
          <button key={'d' + g.id} className={'item' + (brush === 'door:' + g.id ? ' active' : '')} title={`${colorName(g.color)}门：只占空气格，右键擦`} onClick={() => dispatch(setBrush('door:' + g.id))}>
            <div className="icon"><div className="frame" style={{ backgroundImage: `url(${tilesUrl})`, backgroundPosition: `-${TILE_FRAMES.door * TILE_SIZE}px 0`, backgroundColor: hex(g.color), backgroundBlendMode: 'multiply' }} /></div>
            <div className="label"><b>{colorName(g.color)}门</b><button className="mini" title="删除这组" onClick={e => { e.stopPropagation(); dispatch(removeLock(g.id)); }}>✕</button></div>
          </button>,
        ])}
        <button className="item add" disabled={(locks?.groups.length ?? 0) >= 9} onClick={() => dispatch(addLock())}>
          <div className="icon"><span>＋</span></div>
          <div className="label"><b>添加一组</b><small>{(locks?.groups.length ?? 0)}/9</small></div>
        </button>
      </div>

      <h2>迷雾区</h2>
      <div className="palette">
        {FOG_ZONES.map(z => (
          <button key={z} className={'item' + (brush === fogBrush(z) ? ' active' : '')} title={`迷雾区 ${z}：玩家踏进区内任一格，整个区永久揭开`} onClick={() => dispatch(setBrush(fogBrush(z)))}>
            <div className="icon"><div className="swatch" style={{ background: '#' + FOG_ZONE_COLORS[z].toString(16).padStart(6, '0') }} /></div>
            <div className="label"><b>迷雾区 {z}</b><small>fog</small></div>
          </button>
        ))}
        <button className={'item' + (brush === fogBrush('.') ? ' active' : '')} title="擦掉迷雾区标记（也可以选任意迷雾区后右键）" onClick={() => dispatch(setBrush(fogBrush('.')))}>
          <div className="icon"><span>⌫</span></div>
          <div className="label"><b>擦除迷雾区</b><small>fog</small></div>
        </button>
      </div>
      <div className="hint">迷雾区叠在砖块之上，不影响地形。区外的地方靠光照自然揭示。</div>

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
          {g === '吃豆人' && <div className="hint">这些放在「俯视」层里用（层设置里勾）。</div>}
        </div>
      ))}
    </>
  );
}
