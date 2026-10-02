// ===== 节奏关卡试玩（开发工具）：下面就是游戏画面，直接在庆典大厅里打；上面一排按钮随时从某一段 / 某一秒重新开始 =====
// 不说开场白、不放板、不填血条，点了就从那一刻开打（正在打就先收掉）；默认无敌，方便只看谱面。
// 用的是和正式游戏同一套东西（EVT.rhythmStart 带上 test），改了谱面 / 参数保存后在这里马上能试。
// 这是开发工具，界面保持中文（和地图编辑器一样）。
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { bridge, EVT, type StartGameData } from '@/protocol';
import { CHARTS, endMs, rhythmSession, sectionAt, sectionStarts, type Chart } from '@/rhythm';
import { DEFAULT_PROJECT } from '@/game/world/defaultWorld';
import { roomPx } from '@/game/PhaserGame';
import { PhaserCanvas } from '../PhaserCanvas';
import { Hud } from '../Hud';
import { CrumpleOverlay } from '../crumple/CrumpleOverlay';
import { StageLayer } from '../stage/StageLayer';
import { ChartTimeline } from './ChartTimeline';
import { MODE_KEYS, type Press } from './modeKeys';

/** 每种玩法叫什么（开发工具里直接写中文） */
const MODE_NAME: Record<string, string> = { giveup: 'Give It Up', dash: '重力翻转', taiko: '太鼓', mania: '节奏大师', osu: 'osu', saber: '光剑', dodge: '躲弹幕' };
/** 现在放到第几秒：隔多久看一次（毫秒） */
const POLL_MS = 100;
const modeName = (mode: string) => MODE_NAME[mode] ?? mode;

const clock = (ms: number) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
/** 点完按钮把焦点还给游戏：不然接下来按空格会再点一次这个按钮 */
const unfocus = (e: MouseEvent<HTMLElement>) => e.currentTarget.blur();

export function RhythmLab({ onRecorder }: { onRecorder: () => void }) {
  const editorProject = useAppSelector(s => s.editor.project);
  const [chart, setChart] = useState<Chart>(CHARTS[0]);
  const [god, setGod] = useState(true);
  const [seconds, setSeconds] = useState('0');
  /** 正在打：曲子放到第几毫秒；没在打是 null */
  const [now, setNow] = useState<number | null>(null);

  // 直接从这张谱的场地（庆典大厅）开始；编辑器里的地图没有这一层就从打包的默认地图里借
  const data = useMemo<StartGameData>(() => {
    const borrowed = DEFAULT_PROJECT.floors.find(f => f.id === chart.arena);
    const has = editorProject.floors.some(f => f.id === chart.arena);
    const project = has || !borrowed ? editorProject : { ...editorProject, floors: [...editorProject.floors, borrowed] };
    return { project, playtest: true, rhythmLab: true, floorId: project.floors.some(f => f.id === chart.arena) ? chart.arena : undefined };
  }, [editorProject, chart]);
  const size = roomPx((data.project.floors.find(f => f.id === data.floorId) ?? data.project.floors[0]).model);

  useEffect(() => {
    const timer = window.setInterval(() => { const s = rhythmSession(); setNow(s ? s.conductor.timeMs() : null); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  // 实时记录：试玩时按的每一下（只认那一段在游戏里用的键）记下曲子的时间，画在时间线上；从某一刻重新开始 = 那之后的重新记
  const presses = useRef<Press[]>([]);
  const [count, setCount] = useState(0);
  const [idleMs, setIdleMs] = useState(0);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = rhythmSession();
      if (!s || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const ms = Math.round(s.conductor.timeMs()), allowed = MODE_KEYS[s.chart.sections[sectionAt(s.chart, ms)].mode]?.codes;
      if (allowed && !allowed.includes(e.code)) return;
      presses.current.push({ ms, code: e.code });
      setCount(presses.current.length);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const s = rhythmSession(), p = [...presses.current].reverse().find(x => x.code === e.code && x.upMs === undefined);
      if (s && p) p.upMs = Math.round(s.conductor.timeMs());
    };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, []);
  useEffect(() => { presses.current = []; setCount(0); setIdleMs(0); }, [chart]);

  const playFrom = useCallback((ms: number) => {
    const fromMs = Math.max(0, Math.min(ms, endMs(chart) - 1));
    presses.current = presses.current.filter(p => p.ms < fromMs);
    setCount(presses.current.length); setIdleMs(fromMs); setStatus('');
    bridge.emit(EVT.rhythmStart, { chartId: chart.id, test: { fromMs, god } });
  }, [chart, god]);
  const save = async () => {
    const body = { chartId: chart.id, bpm: chart.bpm, offsetMs: chart.offsetMs, recordedAt: new Date().toISOString(), presses: [...presses.current].sort((a, b) => a.ms - b.ms) };
    try {
      const r = await fetch('/__climb/save-recording', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json() as { ok: boolean; file?: string; error?: string };
      setStatus(j.ok ? `已存到 ${j.file}（${body.presses.length} 下）` : `没存上：${j.error}`);
    } catch { setStatus('没存上：只有开发服务器（npm run dev）能写文件'); }
  };
  const stop = () => bridge.emit(EVT.rhythmStop);
  const starts = sectionStarts(chart), current = now === null ? -1 : sectionAt(chart, now);

  return (
    <div className="view lab-play">
      <div className="lab-toolbar">
        <select className="btn" value={chart.id} onChange={e => setChart(CHARTS.find(c => c.id === e.target.value) ?? CHARTS[0])}>
          {CHARTS.map(c => <option key={c.id} value={c.id}>{c.id}（{c.bpm} BPM）</option>)}
        </select>
        {chart.sections.map((s, i) => (
          <button key={i} className={'btn lab-jump' + (i === current ? ' now' : '')} title="从这一段的开头开始" onClick={e => { unfocus(e); playFrom(starts[i]); }}>
            <b>{modeName(s.mode)}</b><span>{clock(starts[i])}</span>
          </button>
        ))}
        <span className="lab-from">
          从第 <input className="btn" type="number" min={0} step={1} value={seconds} onChange={e => setSeconds(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.currentTarget.blur(); playFrom(Number(seconds) * 1000 || 0); } }} /> 秒
          <button className="btn primary" onClick={e => { unfocus(e); playFrom(Number(seconds) * 1000 || 0); }}>开始</button>
        </span>
        <button className="btn" disabled={now === null} onClick={e => { unfocus(e); stop(); }}>停止</button>
        <label className="lab-check"><input type="checkbox" checked={god} onChange={e => { setGod(e.target.checked); e.currentTarget.blur(); }} /> 无敌</label>
        <span className="lab-now">{now === null ? '没在打' : clock(now)}</span>
        <span className="lab-right lab-status">{status}</span>
        <button className="btn" disabled={!count} title="把这次试玩里按的键存成 recordings/<谱面>.json，之后照着它改谱面" onClick={e => { unfocus(e); void save(); }}>保存按键（{count}）</button>
        <button className="btn" disabled={!count} onClick={e => { unfocus(e); presses.current = []; setCount(0); }}>清空</button>
        <button className="btn" onClick={onRecorder}>谱面录制</button>
      </div>
      <ChartTimeline chart={chart} presses={presses} idleMs={idleMs} modeName={modeName} onSeek={playFrom} />
      <div className="stage">
        <PhaserCanvas mode="game" data={data} size={size} /><StageLayer /><Hud /><CrumpleOverlay />
      </div>
    </div>
  );
}
