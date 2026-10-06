// ===== 第一幕的结局画面：夸张的庆祝——巨大的「你赢了！」、礼花、派对喇叭、开香槟、小孩欢呼、罐头掌声 =====
// 选项：继续 / 重新开始 / 退出（「继续」被 GM 扔掉之后就没了）。键盘、手柄、鼠标、触屏都能选（ui/menu/useMenuNav）。
// inspect：演出里 GM 把它拽进来检查用——不出声、不响应按键，「继续」按钮交出去给演出揉成纸团。
import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { bridge, EVT } from '@/protocol';
import type { EndingChoice } from '@/story/config';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { Confetti } from '@/ui/Confetti';
import { preloadSfx, sfx } from './sfx';

/** 几样音效从结局画面出现起多少毫秒开始放 */
const CHEER: [Parameters<typeof sfx>[0], number, number][] = [
  ['partyHorn', 0, 0.9], ['confetti', 80, 1], ['cork', 550, 0.9], ['yay', 750, 0.8], ['applause', 1000, 0.7], ['partyHorn', 1900, 0.6],
];
/** 礼花一共喷几轮、每轮隔多久 */
const BURSTS = 3, BURST_MS = 700;

interface Props {
  choices: EndingChoice[];
  inspect?: boolean;
  /** 演出要揉掉的「继续」按钮 */
  continueRef?: Ref<HTMLButtonElement>;
  /** 演出里：「继续」已经被揉掉了，空出它的位置 */
  crumpled?: boolean;
}

export function Celebration({ choices, inspect, continueRef, crumpled }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState(1);
  const picked = useRef(false);

  useEffect(() => {
    if (inspect) return;
    preloadSfx('click');
    const stops = CHEER.map(([name, at, v]) => sfx(name, v, at));
    const timers = Array.from({ length: BURSTS - 1 }, (_, k) => window.setTimeout(() => setBurst(k + 2), BURST_MS * (k + 1)));
    return () => { stops.forEach(s => s()); timers.forEach(clearTimeout); };
  }, [inspect]);

  const pick = (i: number) => {
    if (picked.current || inspect) return;
    picked.current = true;
    sfx('click');
    bridge.emit(EVT.endingChoice, choices[i]);
  };
  useMenuNav({ count: choices.length, index, enabled: !inspect, setIndex: i => { setIndex(i); sfx('click', 0.4); }, onPick: pick });

  return (
    <div className={'celebration' + (inspect ? ' inspect' : '')}>
      {!inspect && Array.from({ length: burst }, (_, k) => <Confetti key={k} pieces={140} />)}
      <div className="cel-rays" />
      <div className="cel-title">{t('story.ending.title')}</div>
      <div className="cel-choices">
        {choices.map((c, i) => (
          <button key={c} ref={c === 'continue' ? continueRef : undefined}
            className={'cel-btn' + (!inspect && i === index ? ' sel' : '') + (c === 'continue' && crumpled ? ' gone' : '')}
            onMouseEnter={() => setIndex(i)} onClick={() => pick(i)}>
            {t(`story.ending.${c}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
