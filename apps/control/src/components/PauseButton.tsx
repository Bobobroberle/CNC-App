import { PauseIcon } from 'lucide-react';
import { t } from '../i18n';
import { useMachine } from '../store/machine';

/**
 * PAUSE (DESIGN.md §4, §6.4): feed hold with one tap, no question asked, in
 * the status bar of every screen beside NOT-HALT. It is never disabled –
 * whatever moves can be held – and, like NOT-HALT, it acts when the finger
 * lands and stays reachable while a dialog is open (`aria-live="off"`, see
 * `EStopButton`). It only holds: going on again is a deliberate step in ⑤.
 */
export function PauseButton() {
  const feedHold = useMachine((s) => s.feedHold);
  const holding = useMachine((s) => s.status?.state.startsWith('Hold') === true);
  return (
    <button
      type="button"
      className="pause"
      data-testid="pause"
      data-find="pause"
      data-holding={holding ? '' : undefined}
      aria-live="off"
      aria-pressed={holding}
      title={t('bar.pauseHint')}
      onPointerDown={(e) => {
        e.preventDefault();
        feedHold();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) feedHold();
        }
      }}
    >
      <PauseIcon aria-hidden="true" />
      <span>{t('bar.pause')}</span>
    </button>
  );
}
