import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setConfig } from '@/redux/slices/configSlice';
import { Skills } from '@/game/registry/registry';
import '@/game/registry/skills';
import { InputNumber, Select } from 'antd';

/** 左边栏底部：游戏设置（文件操作在右边栏的 FilePanel） */
export function Toolbar() {
  const { skill, deathResetsWorld, directionalBlast, playerHeight, explosionRadius } = useAppSelector(s => s.config);
  const dispatch = useAppDispatch();

  return (
    <>
      <h2>游戏设置</h2>
      <div className="row">
        <span className="hint" style={{ flex: 'none', alignSelf: 'center' }}>技能</span>
        <Select size="small" value={skill} onChange={v => dispatch(setConfig({ skill: v }))} options={Skills.list().map(sk => ({ value: sk.id, label: sk.name, title: sk.desc }))} />
      </div>
      <div className="row">
        <span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>玩家身高</span>
        <InputNumber size="small" min={0.4} max={2.5} step={0.05} value={playerHeight} addonAfter="格" onChange={v => v && dispatch(setConfig({ playerHeight: v }))} />
      </div>
      <div className="row">
        <span className="hint" style={{ flex: 'none', alignSelf: 'center', width: 60 }}>爆炸半径</span>
        <InputNumber size="small" min={0.5} max={5} step={0.5} value={explosionRadius} addonAfter="格" onChange={v => v && dispatch(setConfig({ explosionRadius: v }))} />
      </div>
      <div className="hint">单位都是格。身高小于 1 才能钻一格高的缝（建议 0.94）。改完下次试玩生效；默认值在 game/config.ts。</div>
      <label className="check"><input type="checkbox" checked={directionalBlast} onChange={e => dispatch(setConfig({ directionalBlast: e.target.checked }))} /> 定向爆炸（按住方向起跳，炸那边两格）</label>
      <label className="check"><input type="checkbox" checked={deathResetsWorld} onChange={e => dispatch(setConfig({ deathResetsWorld: e.target.checked }))} /> 死亡重置整张地图</label>

    </>
  );
}
