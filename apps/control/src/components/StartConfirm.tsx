import { TriangleAlertIcon } from 'lucide-react';
import { t } from '../i18n';
import { useRun } from '../store/run';
import { confirmAndStart, useStart } from '../store/start';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog';
import { HoldButton } from './HoldButton';

/**
 * "Vor dem Start bestätigen" (DESIGN.md §6.4): a start without a zero, with
 * the tool below the safe height or with a probe in the spindle is not
 * passed over. The hold in the action bar opens this instead of starting;
 * the start is the second hold, in here, next to what it confirms.
 */
export function StartConfirm() {
  const asking = useRun((s) => s.asking);
  const start = useStart();
  const close = () => useRun.getState().ask(null);
  const open = asking !== null && start !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPopup className="max-w-lg" data-testid="start-confirm">
        <DialogHeader>
          <DialogTitle>{t('startConfirm.title')}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <DialogDescription>{t('startConfirm.text')}</DialogDescription>
          <ul className="confirm-list">
            {(asking ?? []).map((w) => (
              <li key={w} data-warning={w}>
                <TriangleAlertIcon aria-hidden="true" className="size-6 text-warning-foreground" />
                <span>
                  <strong>{t(`startConfirm.${w}.title`)}</strong>
                  <span className="text-muted-foreground text-sm">
                    {t(`startConfirm.${w}.text`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('startConfirm.back')}
          </Button>
          <span className="confirm-hold">
            <HoldButton
              variant="accent"
              duration={1000}
              disabled={!start || start.reason !== null}
              onConfirm={() => start && confirmAndStart(start)}
            >
              {t('startConfirm.start')}
            </HoldButton>
          </span>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
