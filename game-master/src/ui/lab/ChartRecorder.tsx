// ===== 谱面录制（开发工具）：听着曲子按键，把每一下按在曲子的第几毫秒、按的哪个键记下来 =====
// 录完存成 recordings/<谱面 id>.json（开发服务器的 /__climb/save-recording），之后照着它重新写谱面。
// 时间以音频的播放位置为准，和游戏里的指挥（rhythm/Conductor）是同一个钟。
// 这是开发工具，界面保持中文（和地图编辑器一样）。
import { useEffect, useRef, useState } from 'react';
import { keyName as shortKey, MODE_KEYS, type Press } from './modeKeys';
import { beatMs, CHARTS, endMs, RHYTHM_MODES, sectionAt, sectionStarts, type Chart } from '@/rhythm';

/** 这些键按了不让浏览器滚动页面；最近的按键显示多少个；节拍灯每拍亮多久（占一拍的比例） */
const BLOCKED = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], RECENT = 14, BLINK = 0.25;

const clock = (ms: number) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; };
const keyName = (code: string) => shortKey(code).replace('␣', '空格');

export function ChartRecorder({ onBack }: { onBack: () => void }) {
  const [chart, setChart] = useState<Chart>(CHARTS[0]);
  const [recording, setRecording] = useState(false);
  const [presses, setPresses] = useState<Press[]>([]);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pressesRef = useRef<Press[]>([]);

  const stop = () => { audioRef.current?.pause(); setRecording(false); };
  const start = () => {
    stop();
    const audio = audioRef.current = new Audio(import.meta.env.BASE_URL + chart.audio);
    pressesRef.current = []; setPresses([]); setNow(0); setStatus('');
    audio.addEventListener('ended', () => setRecording(false));
    audio.play().then(() => setRecording(true)).catch(() => setStatus('曲子放不出来：文件不在，或者浏览器不让自动播放'));
  };

  // 录的时候：每一下按键记下曲子的时间；每帧刷新时间显示
  useEffect(() => {
    if (!recording) return;
    const audio = audioRef.current!;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (BLOCKED.includes(e.code)) e.preventDefault();
      // 只认现在这一段在游戏里用的键：只能按空格的地方按 A W S D 不记
      const ms = Math.round(audio.currentTime * 1000), allowed = MODE_KEYS[chart.sections[sectionAt(chart, ms)].mode]?.codes;
      if (allowed && !allowed.includes(e.code)) return;
      pressesRef.current.push({ ms, code: e.code });
      setPresses([...pressesRef.current]);
    };
    // 松开：记到这个键最近那一下还没松开的按键上（按了多久 = 长按）
    const onKeyUp = (e: KeyboardEvent) => {
      const p = [...pressesRef.current].reverse().find(x => x.code === e.code && x.upMs === undefined);
      if (p) p.upMs = Math.round(audio.currentTime * 1000);
    };
    let raf = 0;
    const tick = () => { setNow(audio.currentTime * 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [recording, chart]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const recordingData = () => ({ chartId: chart.id, bpm: chart.bpm, offsetMs: chart.offsetMs, recordedAt: new Date().toISOString(), presses });
  const save = async () => {
    try {
      const r = await fetch('/__climb/save-recording', { method: 'POST', body: JSON.stringify(recordingData()) });
      const j = await r.json() as { ok: boolean; file?: string; error?: string };
      setStatus(j.ok ? `已存到 ${j.file}（${presses.length} 下）` : `没存上：${j.error}`);
    } catch { setStatus('没存上：只有开发服务器（npm run dev）能直接写文件，用「下载」吧'); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(recordingData(), null, 2)], { type: 'application/json' }));
    a.download = `${chart.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 现在在第几小节第几拍、现在这一段（按现有谱面的分段）是什么玩法
  const beat = beatMs(chart), beats = (now - chart.offsetMs) / beat;
  const bar = Math.floor(beats / 4) + 1, inBar = Math.floor(((beats % 4) + 4) % 4) + 1, onBeat = beats >= 0 && beats % 1 < BLINK;
  const section = sectionAt(chart, now), mode = chart.sections[section].mode, starts = sectionStarts(chart);

  return (
    <div className="lab-panel">
      <div className="lab-row">
        <button className="btn" onClick={() => { stop(); onBack(); }}>← 返回</button>
        <select className="btn" value={chart.id} disabled={recording} onChange={e => setChart(CHARTS.find(c => c.id === e.target.value) ?? CHARTS[0])}>
          {CHARTS.map(c => <option key={c.id} value={c.id}>{c.id}（{c.bpm} BPM）</option>)}
        </select>
        {recording
          ? <button className="btn primary" onClick={stop}>停止</button>
          : <button className="btn primary" onClick={start}>{presses.length ? '重新录' : '开始录'}</button>}
        <button className="btn" disabled={recording || !presses.length} onClick={save}>保存</button>
        <button className="btn" disabled={recording || !presses.length} onClick={download}>下载</button>
      </div>
      <div className="hint">点「开始录」后曲子从头放，听着按键盘就行，每一段只记这一段在游戏里用的键（按在曲子的第几毫秒、哪个键、按了多久——按住不放就是长按）。录完点「保存」，文件在 recordings/ 里。</div>

      <div className="lab-clock">
        <span className={'lab-beat' + (recording && onBeat ? ' on' : '') + (inBar === 1 ? ' first' : '')} />
        <span className="lab-time">{clock(now)}</span>
        <span className="lab-bar">第 {Math.max(1, bar)} 小节 · 第 {inBar} 拍</span>
        <span className="lab-count">{presses.length} 下</span>
      </div>

      <div className="lab-sections">
        {chart.sections.map((s, i) => (
          <div key={i} className={'lab-section' + (i === section && now < endMs(chart) ? ' now' : '')} style={{ flexGrow: s.rows.length }}>
            <b>{s.mode}</b><span>{clock(starts[i])}</span>
          </div>
        ))}
      </div>
      <div className="hint">现在这一段（按现有谱面的分段）：<b>{mode}</b>（{RHYTHM_MODES[mode].realm === 'flat' ? '2D' : '3D'}）—— 这一段只认：{MODE_KEYS[mode]?.hint}</div>

      <div className="lab-keys">
        {presses.slice(-RECENT).map((p, i) => <span key={presses.length - RECENT + i} className="lab-key"><kbd>{keyName(p.code)}</kbd>{clock(p.ms)}</span>)}
      </div>
      {status && <div className="lab-status">{status}</div>}
    </div>
  );
}
