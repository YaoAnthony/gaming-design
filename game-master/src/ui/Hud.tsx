import { memo, useEffect, useState, type CSSProperties } from 'react';
import { shallowEqual } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { WinModal } from './WinModal';
import { Celebration } from './story/Celebration';
import { bridge, EVT } from '@/protocol';
import { AVATARS, HEART_ICONS } from '@/asset';
import { Typewriter } from './Typewriter';
import { ResetButtonIcon } from './PadIcons';
import { RHYTHM_MODES, type ModeId } from '@/rhythm/modes';

/** 好几管血时，除了最上面那一管（金色）之外的颜色有几种，轮着用（样式在 app.css 的 .tube-cN） */
const TUBE_COLORS = 6;

/** 一格血多宽（像素）：一管格子少就画宽一点，格子多就窄一点，整条差不多一样长 */
const SEG_PX = { total: 300, min: 14, max: 26 };
/**
 * 血越多血条越大：每多叠一管放大 perTube 倍（从顶边正中往外长，新叠上一管时弹一下）；
 * 但整条最宽只到窗口宽度的 fit（手机上不撑出屏幕；extraPx = 格子之外的边框、×N 大概多宽）
 */
const BAR_GROW = { perTube: 0.07, fit: 0.94, extraPx: 60 };

/**
 * Boss 的血条（所有 Boss 共用：史莱姆王、节奏关卡的 Game Master……，数据见 hudSlice 的 BossBarState）。
 * per = 一管多少滴：血多的时候分成好几管，只画最上面那一管，打空的格子露出下一管的颜色；不写 per 就是一管。
 * 右边写还剩几管（×1 起），下面是名字（紫色、发光）。管越多血条越大（BAR_GROW）、一管一个颜色；
 * 不止一管时，满管数的那一管（最后填上的）是金色的，带流光
 */
const BossBar = memo(function BossBar() {
  const boss = useAppSelector(s => s.hud.boss, shallowEqual);
  const { t } = useTranslation();
  if (!boss) return null;
  const { hp, max, name } = boss, per = Math.max(1, Math.min(boss.per ?? max, max));
  const tubes = Math.ceil(max / per), bars = Math.max(1, Math.ceil(hp / per)), top = hp - (bars - 1) * per;   // 一共几管；还剩几管（空了也写 ×1）；最上面那一管剩几滴
  const color = (n: number) => (tubes > 1 && n >= tubes ? ' tube-gold' : ' tube-c' + ((n - 1) % TUBE_COLORS));   // 第 n 管（1 起）什么颜色
  const seg = Math.round(Math.max(SEG_PX.min, Math.min(SEG_PX.max, SEG_PX.total / per)));
  const fit = window.innerWidth * BAR_GROW.fit / (per * (seg + 2) + BAR_GROW.extraPx);
  const grow = Math.min(1 + (bars - 1) * BAR_GROW.perTube, Math.max(1, fit));
  return (
    <div className={'boss-bar tubes' + (tubes > 1 && bars >= tubes && hp > 0 ? ' crowned' : '')} style={{ '--grow': grow.toFixed(3), '--seg': `${seg}px` } as CSSProperties}>
      {Array.from({ length: per }, (_, i) => <span key={i} className={'seg' + (i < top ? ' on' + color(bars) : bars > 1 ? ' under' + color(bars - 1) : '')} />)}
      <span key={bars} className="tube-count">×{bars}</span>
      {name && <span className="boss-name">{t(name)}</span>}
    </div>
  );
});

/** 心：节奏关卡里两滴一格（满格金色，剩一滴红色）；平时一颗一滴。key 带上状态：变了就重新挂载，播一次「掉心」动画 */
const Hearts = memo(function Hearts() {
  const hearts = useAppSelector(s => s.hud.hearts, shallowEqual);
  if (!hearts) return null;
  const cells = hearts.tiered
    ? Array.from({ length: Math.ceil(hearts.max / 2) }, (_, i) => { const left = hearts.hp - i * 2; return left >= 2 ? 'gold' : left === 1 ? 'full' : 'empty'; })
    : Array.from({ length: hearts.max }, (_, i) => (i < hearts.hp ? 'full' : 'empty'));
  return (
    <div className="hearts" aria-label={`${hearts.hp} / ${hearts.max}`}>
      {cells.map((state, i) => <img key={`${i}-${state}`} className={'heart ' + state} src={state === 'empty' ? HEART_ICONS.empty : HEART_ICONS.full} alt="" draggable={false} />)}
    </div>
  );
});

/** 节奏关卡：底下的按键提示（跟着玩法换，表在 rhythm/modes.ts 的 hints） */
const RhythmKeys = memo(function RhythmKeys() {
  const mode = useAppSelector(s => s.hud.rhythm?.mode ?? null);
  const { t } = useTranslation();
  const spec = mode && Object.hasOwn(RHYTHM_MODES, mode) ? RHYTHM_MODES[mode as ModeId] : null;
  if (!spec) return null;
  return (
    <div className="rhythm-keys">
      {spec.hints.map(k => <span key={k.hint} className="rk-item">{k.keys.map(c => <kbd key={c}>{c}</kbd>)}<span>{t(`rhythm.hint.${k.hint}`)}</span></span>)}
    </div>
  );
});

/** 节奏关卡：每次判定弹一个字和连击数（key 带上 seq：每次重新挂载，播一次弹出的动画） */
const RhythmJudge = memo(function RhythmJudge() {
  const r = useAppSelector(s => s.hud.rhythm, shallowEqual);
  const { t } = useTranslation();
  if (!r?.judge) return null;
  return (
    <div key={r.seq} className={'rhythm-judge ' + r.judge}>
      <div className="rj-word">{t(`rhythm.judge.${r.judge}`)}</div>
      {r.combo > 1 && <div className="rj-combo">{r.combo}</div>}
    </div>
  );
});

/** 右上角的分数 */
const Score = memo(function Score() {
  const score = useAppSelector(s => s.hud.score);
  return score === null ? null : <div className="score">{score}</div>;
});

/**
 * 叠在画布上的 HUD：事件提示、通关画面（不显示常驻提示条）。
 * 血条、心、分数、节奏关卡的判定字各自只订自己那一小块：节奏关卡里每个音符都会派发好几次，不能每次把整个 HUD 重画一遍
 */
export function Hud() {
  const hud = useAppSelector(s => s.hud, (a, b) => a.mode === b.mode && a.ending === b.ending && a.bossIntro === b.bossIntro && a.place === b.place && a.whiteout === b.whiteout && a.message === b.message
    && a.dialogue === b.dialogue && a.jumps === b.jumps && a.destroyed === b.destroyed && a.playtest === b.playtest && a.final === b.final && a.wonStage === b.wonStage && a.wonHat === b.wonHat);
  const { t } = useTranslation();
  const [msgVisible, setMsgVisible] = useState(false);
  /** 最后用的输入设备：提示按它显示（键盘写 R，手柄画重置键） */
  const device = useAppSelector(s => s.input.device);

  // 真结束（最后一层）关掉弹窗后不能继续玩，只是把弹窗收起来；下次通关再出现
  const [winClosed, setWinClosed] = useState(false);
  useEffect(() => { if (hud.mode !== 'won') setWinClosed(false); }, [hud.mode]);

  useEffect(() => { if (!hud.message) return; setMsgVisible(true); const t = setTimeout(() => setMsgVisible(false), 1100); return () => clearTimeout(t); }, [hud.message]);

  if (hud.mode === 'idle' || hud.mode === 'opening') return null;
  return (
    <div className="hud">
      {hud.bossIntro === 'warning' && (
        <div className="boss-warning">
          <div className="bw-band">
            <div className="bw-stripes" />
            <div className="bw-text">{t('bossIntro.warning')}</div>
            <div className="bw-sub">{t('bossIntro.approach')}</div>
            <div className="bw-stripes" />
          </div>
        </div>
      )}
      {hud.bossIntro === 'title' && (
        <div className="boss-title">
          <div className="bt-sub">{t('bossIntro.sub')}</div>
          <div className="bt-name">{t('bossIntro.name')}</div>
          <div className="bt-line" />
        </div>
      )}
      <BossBar />
      <div className="corner">
        {hud.place && <div className="place">{t('place', { place: hud.place })}</div>}
        <Hearts />
      </div>
      <Score />
      {hud.whiteout > 0 && <div key={hud.whiteout} className="whiteout" />}
      <RhythmKeys />
      <RhythmJudge />
      {hud.message && <div className={'hud-msg' + (msgVisible ? ' show' : '')} style={{ color: hud.message.color }}>{hud.message.text}</div>}
      {hud.mode === 'playing' && hud.dialogue?.shout && <div key={hud.dialogue.index} className="dialogue-shout">{hud.dialogue.shout}</div>}
      {hud.mode === 'playing' && hud.dialogue && (
        <div className={'dialogue pos-' + (hud.dialogue.pos ?? 'bottom')}>
          {hud.dialogue.avatar && AVATARS[hud.dialogue.avatar] && <img className="dialogue-avatar" src={AVATARS[hud.dialogue.avatar]} alt="" />}
          <div className="dialogue-body">
            <div className="dialogue-name">{hud.dialogue.speaker}</div>
            <div className={'dialogue-text' + (hud.dialogue.grow ? ' grow' : '') + (hud.dialogue.think ? ' think' : '')}><Typewriter key={hud.dialogue.index + ":" + hud.dialogue.text} text={hud.dialogue.text} grow={hud.dialogue.grow} /></div>
            {!hud.dialogue.auto && <div className="dialogue-hint">▸</div>}
          </div>
        </div>
      )}
      {hud.mode === 'dead' && (
        <div className="death" onPointerDown={() => bridge.emit(EVT.requestReset)}>
          <div className="death-title">{t('dead')}</div>
          {device === 'keyboard'
            ? <div className="death-sub">{t('deadHint')}</div>
            : <div className="death-sub death-sub-pad"><span>{t('deadPad.before')}</span><ResetButtonIcon kind={device} /><span>{t('deadPad.after')}</span></div>}
        </div>
      )}
      {hud.mode === 'won' && hud.ending && <Celebration key={hud.ending.id} choices={hud.ending.choices} />}
      {hud.mode === 'won' && !hud.ending && !winClosed && (
        <WinModal jumps={hud.jumps} destroyed={hud.destroyed} playtest={hud.playtest} final={hud.final} stage={hud.wonStage} hat={hud.wonHat}
          onClose={() => { if (hud.final) setWinClosed(true); else bridge.emit(EVT.continueGame); }}
          onRetry={() => bridge.emit(EVT.restartGame)}
          onNext={() => bridge.emit(EVT.nextLevel)} />
      )}
    </div>
  );
}
