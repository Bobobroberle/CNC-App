import { t } from '../i18n';
import { useMachine } from '../store/machine';

/** Always reachable, big, red, one tap. Hardware E-stop stays the real safety device. */
export function EStopButton() {
  const emergencyStop = useMachine((s) => s.emergencyStop);
  return (
    <button
      type="button"
      className="estop"
      data-find="estop"
      // While a dialog is open, Base UI hides everything outside it from assistive
      // technology – except live regions. NOT-HALT must never be hidden: marked as a
      // (silent) live region, it and the bar it sits in stay reachable.
      aria-live="off"
      title={t('estop.hint')}
      onPointerDown={(e) => {
        e.preventDefault();
        emergencyStop();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          emergencyStop();
        }
      }}
    >
      {t('estop.label')}
    </button>
  );
}
