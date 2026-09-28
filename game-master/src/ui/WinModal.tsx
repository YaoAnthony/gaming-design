// ===== 通关弹窗：和对话框同一套样子（深底、米白描边），后面炸一次礼花。右上角 X 关掉，「再来一次」从这一局的起点重开 =====
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Confetti } from './Confetti';

interface Props {
  jumps: number;
  destroyed: number;
  /** 试玩中：提示 ESC 回编辑器 */
  playtest: boolean;
  /** 真通关：按钮是「再来一次」；假通关：按钮是「进入下一关」 */
  final: boolean;
  /** 第几关（0/1/2）+ 通关时戴没戴帽子：戴着就换一句标题 */
  stage: number;
  hat: boolean;
  onClose: () => void;
  onRetry: () => void;
  onNext: () => void;
}

export function WinModal({ jumps, destroyed, playtest, final, stage, hat, onClose, onRetry, onNext }: Props) {
  const { t } = useTranslation();
  const title = hat ? t(`wonHat${Math.min(Math.max(stage, 0), 2)}`) : t('won');
  return (
    <div className="modal-backdrop">
      <Confetti />
      <motion.div className="win-modal" role="dialog" aria-modal="true" aria-labelledby="win-title"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
        <button className="win-close" onClick={onClose} aria-label={t('wonClose')}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" /></svg>
        </button>
        <div id="win-title" className="win-title">{title}</div>
        <dl className="win-stats">
          <div><dt>{t('wonJumps')}</dt><dd>{jumps}</dd></div>
          <div><dt>{t('wonDestroyed')}</dt><dd>{destroyed}</dd></div>
        </dl>
        <div className="win-actions">
          {final
            ? <button className="win-retry" onClick={onRetry}>{t('wonRetry')}</button>
            : <button className="win-retry" onClick={onNext}>{t('wonNext')}</button>}
          {playtest && <span className="win-hint">{t('wonEditor')}</span>}
        </div>
      </motion.div>
    </div>
  );
}
