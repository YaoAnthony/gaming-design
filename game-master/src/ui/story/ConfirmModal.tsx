// ===== 确认框：盖在菜单上面，一句问话 + 取消 / 确定（默认选中取消）=====
// 键盘 / 手柄 / 鼠标都能用（ui/menu/useMenuNav）；Esc / B = 取消。onFocus 把选中的那一项交出去：骷髅手指着它。
import { useEffect, useRef, useState } from 'react';
import { useMenuNav } from '@/ui/menu/useMenuNav';
import { sfx } from './sfx';

export function ConfirmModal({ text, no, yes, onNo, onYes, onFocus }: {
  text: string; no: string; yes: string;
  onNo: () => void; onYes: () => void;
  onFocus?: (el: HTMLElement | null) => void;
}) {
  const [index, setIndex] = useState(0);
  const rows = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => { onFocus?.(rows.current[index]); }, [index, onFocus]);

  const pick = (i: number) => { sfx('click'); if (i === 1) onYes(); else onNo(); };
  useMenuNav({ count: 2, index, setIndex: i => { setIndex(i); sfx('click', 0.4); }, onPick: pick, onBack: () => { sfx('click'); onNo(); } });

  return (
    <div className="modal-back">
      <div className="op-settings" role="alertdialog" aria-label={text}>
        <div className="st-ask">{text}</div>
        {[no, yes].map((label, i) => (
          <button key={i} ref={el => { rows.current[i] = el; }} className={'st-row' + (i === index ? ' sel' : '') + (i === 1 ? ' danger' : '')}
            onMouseEnter={() => setIndex(i)} onClick={() => pick(i)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
